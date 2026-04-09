from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
import json
from typing import Any, Literal

import httpx

from .models import AiAgentSettings


Protocol = Literal['anthropic', 'openai']
ProviderProgressCallback = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass(slots=True)
class CompletionResult:
    text: str
    protocol: Protocol
    raw: dict[str, Any]


class ProviderError(RuntimeError):
    pass


class CompatibilityModelProvider:
    def __init__(self, settings: AiAgentSettings):
        self._settings = settings
        self._default_timeout_seconds = 120.0

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        max_tokens: int = 12000,
        json_mode: bool = False,
        on_progress: ProviderProgressCallback | None = None,
        request_timeout_seconds: float | None = None,
    ) -> CompletionResult:
        errors: list[str] = []
        timeout_seconds = request_timeout_seconds or self._default_timeout_seconds
        for protocol in self._candidate_protocols():
            try:
                await self._notify(on_progress, {
                    'type': 'progress',
                    'level': 'activity',
                    'tag': '模型',
                    'message': f'开始尝试 {protocol} 协议。',
                })
                return await self._complete_with_protocol(
                    protocol=protocol,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    json_mode=json_mode,
                    on_progress=on_progress,
                    request_timeout_seconds=timeout_seconds,
                )
            except ProviderError as exc:
                errors.append(str(exc))
                await self._notify(on_progress, {
                    'type': 'progress',
                    'level': 'warning',
                    'tag': '模型',
                    'message': str(exc),
                })

        raise ProviderError(' | '.join(errors) if errors else '未能从模型服务获取响应。')

    async def _complete_with_protocol(
        self,
        *,
        protocol: Protocol,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        on_progress: ProviderProgressCallback | None,
        request_timeout_seconds: float,
    ) -> CompletionResult:
        endpoint = self._resolve_endpoint(protocol)
        headers = self._build_headers(protocol)
        body = self._build_body(
            protocol=protocol,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=json_mode,
        )

        await self._notify(on_progress, {
            'type': 'progress',
            'level': 'info',
            'tag': '模型请求',
            'message': f'准备请求 {protocol} 端点 {endpoint}',
        })

        heartbeat_task: asyncio.Task[None] | None = None
        try:
            heartbeat_task = asyncio.create_task(self._emit_waiting_heartbeat(on_progress))
            timeout = httpx.Timeout(request_timeout_seconds, connect=min(20.0, request_timeout_seconds))
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(endpoint, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            raise ProviderError(
                f'{protocol} 协议调用超时: 等待模型响应超过 {int(request_timeout_seconds)} 秒。'
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f'{protocol} 协议调用失败: {exc!r}') from exc
        finally:
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass

        await self._notify(on_progress, {
            'type': 'progress',
            'level': 'info',
            'tag': '模型响应',
            'message': f'上游模型返回 HTTP {response.status_code}。',
        })

        if response.status_code >= 400:
            raise ProviderError(
                f'{protocol} 协议调用失败: HTTP {response.status_code} - {self._extract_error_text(response)}'
            )

        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            raise ProviderError(f'{protocol} 协议调用返回了无法解析的 JSON: {exc}') from exc

        text = self._extract_text(protocol, payload)
        if not text.strip():
            raise ProviderError(f'{protocol} 协议调用成功，但没有返回可用文本。')

        await self._notify(on_progress, {
            'type': 'progress',
            'level': 'success',
            'tag': '模型',
            'message': '模型文本响应已解析完成。',
        })

        return CompletionResult(text=text, protocol=protocol, raw=payload)

    def _candidate_protocols(self) -> list[Protocol]:
        base_url = self._settings.baseUrl.strip().lower().rstrip('/')
        if '/apps/anthropic' in base_url and 'coding.dashscope.aliyuncs.com' in base_url:
            return ['anthropic']
        if base_url.endswith('/v1/messages') or base_url.endswith('/messages'):
            return ['anthropic']
        if base_url.endswith('/v1/chat/completions') or base_url.endswith('/v3/chat/completions') or base_url.endswith('/chat/completions'):
            return ['openai']
        if self._settings.provider == 'openai':
            return ['openai', 'anthropic']
        return ['anthropic', 'openai']

    def _resolve_endpoint(self, protocol: Protocol) -> str:
        base_url = self._settings.baseUrl.strip().rstrip('/')
        lowered = base_url.lower()
        explicit_suffixes = (
            '/messages',
            '/v1/messages',
            '/chat/completions',
            '/v3/chat/completions',
            '/responses',
            '/completions',
        )
        if any(lowered.endswith(suffix) for suffix in explicit_suffixes):
            return base_url

        if '/apps/anthropic' in lowered and 'coding.dashscope.aliyuncs.com' in lowered:
            suffix = 'v1/messages' if protocol == 'anthropic' else 'v1/chat/completions'
            return f'{base_url}/{suffix}'

        if '/api/coding' in lowered:
            suffix = 'v1/messages' if protocol == 'anthropic' else 'v3/chat/completions'
            return f'{base_url}/{suffix}'

        suffix = 'messages' if protocol == 'anthropic' else 'chat/completions'
        return f'{base_url}/{suffix}'

    def _build_headers(self, protocol: Protocol) -> dict[str, str]:
        api_key = self._settings.apiKey.strip()
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {api_key}',
        }
        if protocol == 'anthropic':
            headers['x-api-key'] = api_key
            headers['anthropic-version'] = '2023-06-01'
        return headers

    def _build_body(
        self,
        *,
        protocol: Protocol,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
    ) -> dict[str, Any]:
        if protocol == 'anthropic':
            payload: dict[str, Any] = {
                'model': self._settings.model,
                'system': system_prompt,
                'messages': [
                    {
                        'role': 'user',
                        'content': user_prompt,
                    }
                ],
                'temperature': temperature,
                'max_tokens': max_tokens,
            }
            if json_mode:
                payload['metadata'] = {'response_format': 'json'}
            return payload

        payload = {
            'model': self._settings.model,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            'temperature': temperature,
            'max_tokens': max_tokens,
            'stream': False,
        }
        if json_mode:
            payload['response_format'] = {'type': 'json_object'}
        return payload

    def _extract_text(self, protocol: Protocol, payload: dict[str, Any]) -> str:
        if protocol == 'anthropic':
            content = payload.get('content')
            if isinstance(content, list):
                parts: list[str] = []
                for item in content:
                    if not isinstance(item, dict):
                        continue
                    if item.get('type') == 'text' and isinstance(item.get('text'), str):
                        parts.append(item['text'])
                return '\n'.join(part for part in parts if part.strip())

        if protocol == 'openai':
            choices = payload.get('choices')
            if isinstance(choices, list) and choices:
                message = choices[0].get('message') if isinstance(choices[0], dict) else None
                if isinstance(message, dict):
                    content = message.get('content')
                    if isinstance(content, str):
                        return content
                    if isinstance(content, list):
                        parts: list[str] = []
                        for item in content:
                            if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str):
                                parts.append(item['text'])
                        return '\n'.join(part for part in parts if part.strip())

            output = payload.get('output')
            if isinstance(output, list):
                parts: list[str] = []
                for item in output:
                    if not isinstance(item, dict):
                        continue
                    for content_item in item.get('content', []) if isinstance(item.get('content'), list) else []:
                        if isinstance(content_item, dict) and content_item.get('type') == 'output_text':
                            text = content_item.get('text')
                            if isinstance(text, str):
                                parts.append(text)
                return '\n'.join(part for part in parts if part.strip())

        return ''

    def _extract_error_text(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except json.JSONDecodeError:
            return response.text.strip() or 'unknown error'

        if isinstance(payload, dict):
            if isinstance(payload.get('error'), dict):
                message = payload['error'].get('message')
                if isinstance(message, str) and message.strip():
                    return message
            for key in ('message', 'detail'):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value

        return response.text.strip() or 'unknown error'

    async def _notify(
        self,
        callback: ProviderProgressCallback | None,
        payload: dict[str, Any],
    ) -> None:
        if callback is None:
            return
        await callback(payload)

    async def _emit_waiting_heartbeat(
        self,
        callback: ProviderProgressCallback | None,
    ) -> None:
        if callback is None:
            return

        started_at = asyncio.get_running_loop().time()
        while True:
            await asyncio.sleep(4)
            elapsed_ms = int((asyncio.get_running_loop().time() - started_at) * 1000)
            await callback({
                'type': 'heartbeat',
                'tag': '模型请求',
                'message': f'仍在等待上游模型响应，已耗时 {max(1, elapsed_ms // 1000)} 秒。',
                'elapsedMs': elapsed_ms,
            })
