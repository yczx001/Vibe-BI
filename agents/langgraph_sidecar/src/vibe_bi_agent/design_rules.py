FRONTEND_DESIGN_SYSTEM_PROMPT = """
You are the built-in Vibe BI front-end design system. These rules are mandatory.

Purpose:
- Generate production-grade BI report experiences with strong visual authorship.
- Always design for clarity, hierarchy, rhythm, readability, and presentation impact.
- Think and design like a high-end front-end design specialist, not a dashboard template generator.

Mandatory design rules:
- Pick a clear aesthetic direction before generating markup.
- Create a memorable page composition with one dominant hero zone and smaller supporting zones.
- Do not use generic AI dashboard aesthetics, average card grids, or evenly distributed cards.
- Do not default to purple-on-white gradients, Inter, Arial, Roboto, or system-only font stacks.
- Use a deliberate typography pairing and differentiated title/body scales.
- Use bold, intentional art direction. The page should feel authored, not mechanically assembled.
- Build atmospheric backgrounds, layered surfaces, and a strong editorial rhythm.
- Use visual contrast between hero, support, and detail zones. Avoid same-sized modules.
- Design around the data story first: key signal, structure comparison, ranking, detail, and filters.
- Use layered backgrounds, atmosphere, and surface treatment; never flat anonymous layouts.
- Use editorial hierarchy: hero insight, KPI belt, trend story, structure comparison, and detail zone.
- Keep spacing intentional. Large modules and compact modules must have visible contrast.
- Filters must be integrated into the page composition, not dumped as isolated blocks.
- The page must look intentionally designed, not merely assembled from widgets.
- Avoid filler copy and generic captions. Keep only report-relevant text and insight-oriented labels.
- Prefer distinctive serif + sans or other characterful typography pairings implemented via CSS variables.

Mandatory output constraints:
- Output must target Vibe BI creative-html mode.
- HTML, CSS, JS, bindings, viewport, and runtime hints must be coherent.
- Every binding must map to real query references and real fields from the provided context.
- Prefer consuming context.reportData in page.js for main rendering. Use context.data only for edge cases.
- For field access, prefer helpers.value(...) and helpers.fieldName(...) instead of hard-coded row['字段'] lookups.
- For query access, prefer context.reportData and helpers.dataSet(...) instead of scattering raw dataset-q ids through the page.
- Build the page shell in html/css, then mount real data into slots from page.js.
- Generated page.js must own local presentation state only. Canonical filter state lives in context.filters and all filter mutations must flow back through runtime filter APIs.
- Generated page.js must be remount-safe: rehydrate local presentation state from runtime context or runtime persistence helpers after rerender.
- Never fabricate values, random sample series, mock rows, or fallback demo metrics when real datasets are available.
- If a required dataset is missing or empty, render an intentional empty state instead of invented numbers.
- If current markup exists and the user asks for modification, preserve good parts and change only what is necessary.
- For modify flows, preserve section inventory, section order, bindings, and interaction wiring unless the user explicitly asks to replace them.
- Prefer repairing weak layout and theme issues over redrawing everything from scratch.
- assistantMessage must be brief, natural, and directly about what changed. Never output validation boilerplate, checklist wording, page/query/component counts, or fake completion claims.
""".strip()

PARITY_STYLE_FAMILIES = {
    'boardroom-editorial',
}

PARITY_LAYOUT_ARCHETYPES = {
    'parity-operational-single-page',
}

PARITY_REQUEST_HINTS = (
    '独立html',
    '独立 html',
    'standalone html',
    'boardroom',
    'editorial',
    '海运',
    '航运',
    'shipping',
)


def _should_enable_parity_lane(
    user_message: str,
    current_report_summary: str | None,
    context_summary: str | None = None,
    semantic_summary: str | None = None,
) -> bool:
    lowered_message = (user_message or '').lower()
    if any(token in lowered_message for token in PARITY_REQUEST_HINTS):
        return True

    semantic_corpus = ' '.join([
        current_report_summary or '',
        context_summary or '',
        semantic_summary or '',
    ]).lower()
    semantic_hints = (
        'ship',
        'shipping',
        '海运',
        '航运',
        '船舶',
        '船型',
        '船龄',
        '运作天数',
        'teu',
    )
    if sum(token in semantic_corpus for token in semantic_hints) >= 3:
        return True

    if not current_report_summary:
        return False

    lowered_summary = current_report_summary.lower()
    return any(token in lowered_summary for token in [*PARITY_STYLE_FAMILIES, *PARITY_LAYOUT_ARCHETYPES])


def _build_parity_lane_guidance(enabled: bool) -> list[str]:
    if enabled:
        return [
            'Parity-class mode is explicitly active for this request.',
            'Treat this as a parity-class page application for the current operational single-page analysis scenario, not as a generic dashboard template.',
            'Set runtimeHints.styleFamily to "boardroom-editorial" and runtimeHints.layoutArchetype to "parity-operational-single-page".',
            'Use a parity-class structure with clear named sections: integrated filters, dominant hero, KPI belt, primary trend, comparison/ranking zone, and detail zone.',
            'If filterOptions or suitable category dimensions exist, render an integrated filter surface and wire at least one real filter interaction in the first output.',
            'Real interaction wiring is mandatory in the first generation pass; do not postpone it to a later repair round.',
        ]

    return [
        'Do not assume parity-class mode unless the request or current runtime hints explicitly require it.',
        'Use a lighter creative-html lane by default: keep strong design quality, but do not force the heavier parity page-app scaffold on every report.',
        'Only emit parity-class runtime hints when the report should explicitly enter the narrowed boardroom-editorial parity lane.',
    ]


def build_design_brief_prompt(
    user_message: str,
    context_summary: str,
    semantic_summary: str,
    current_report_summary: str | None,
) -> str:
    parity_enabled = _should_enable_parity_lane(
        user_message,
        current_report_summary,
        context_summary,
        semantic_summary,
    )
    sections = [
        "Create a concise but high-quality BI design brief in JSON.",
        "The design brief must be explicit about style family, tone, layout archetype, hero focus, filter placement, and narrative modules.",
        "Ground every choice in the provided semantic data summary, raw dataset context, and user request.",
        "Prioritize a strong visual concept and a clear data narrative instead of a generic dashboard grid.",
        *_build_parity_lane_guidance(parity_enabled),
        "",
        "User request:",
        user_message.strip() or "Generate a BI report.",
        "",
        "Semantic data summary:",
        semantic_summary.strip() or "No semantic summary was provided.",
        "",
        "Available data context:",
        context_summary.strip() or "No dataset context was provided.",
    ]

    if current_report_summary:
        sections.extend([
            "",
            "Current report summary:",
            current_report_summary.strip(),
            "Use this as structured artifact context. Preserve section inventory/order, binding intent, and interaction wiring unless the user explicitly asked for a redesign.",
        ])

    sections.extend([
        "",
        "Return JSON only in this shape:",
        """{
  "styleFamily": "string",
  "designTone": "string",
  "layoutArchetype": "string",
  "heroFocus": "string",
  "filterPlacement": "top | left | right",
  "narrative": ["string", "string"],
  "mustKeep": ["string"],
  "mustAvoid": ["string"]
}""",
    ])
    return "\n".join(sections)


def build_generation_prompt(
    user_message: str,
    design_brief: dict,
    context_summary: str,
    semantic_summary: str,
    current_report_summary: str | None,
) -> str:
    parity_enabled = _should_enable_parity_lane(
        user_message,
        current_report_summary,
        context_summary,
        semantic_summary,
    )
    sections = [
        "Generate a Vibe BI creative-html report specification in JSON.",
        "Obey the built-in front-end design system and use only real query refs / real fields from context.",
        "Main contract: html defines named sections, css defines the full visual system, js mounts real data and interactions.",
        "Primary data source is context.reportData; fall back to helpers.dataSet(...) / context.data / context.rowsByQuery only for specialized sections.",
        "Canonical filter state lives in context.filters. Local presentation state is allowed only for UI affordances and must be remount-safe via persistence helpers.",
        "Do not invent demo data, placeholder metrics, or generic equal-card layouts.",
        "Use semantic binding names; avoid aliases like part1/part2.",
        "Keep the output compact: target html+css+js total length under roughly 14000 characters unless absolutely necessary.",
        "Prefer concise reusable CSS and compact page-app JS over extremely verbose inline styling or duplicated helper code.",
        "If a required dataset is empty, render an intentional empty state instead of fake numbers.",
        "Do not output markdown fences.",
        *_build_parity_lane_guidance(parity_enabled),
        "",
        "User request:",
        user_message.strip() or "Generate a BI report.",
        "",
        "Design brief:",
        str(design_brief),
        "",
        "Semantic data summary:",
        semantic_summary.strip() or "No semantic summary was provided.",
        "",
        "Available data context:",
        context_summary.strip() or "No dataset context was provided.",
    ]

    if current_report_summary:
        sections.extend([
            "",
            "Current report summary (semantic reference only):",
            current_report_summary.strip(),
            "Reuse the good parts of the existing result when it helps. For modify flows, preserve section inventory/order, binding intent, interaction/filter wiring, and visual system unless the user explicitly asked for replacement.",
        ])

    sections.extend([
        "",
        "Compact runtime contract available inside page.js:",
        """{
  "context": {
    "report": { "id": "string", "name": "string", "description": "string", "runtimeHints": {} },
    "page": { "id": "string", "name": "string", "viewport": { "width": 1920, "height": 1080 } },
    "theme": { "name": "string", "colors": {}, "typography": {} },
    "artifactKey": "string",
    "reportData": {
      "contractVersion": "parity-v1",
      "layoutProfile": "boardroom-editorial | generic-creative",
      "requiredZones": [],
      "heroMetric": {},
      "secondaryMetrics": [],
      "primaryTrend": {},
      "primaryCategory": {},
      "primaryRanking": {},
      "primaryMatrix": {},
      "primaryTable": {},
      "queryMap": {},
      "filterOptions": [],
      "sections": {},
      "viewModelHints": {}
    },
    "data": { "bindingAlias": { "rows": [], "schema": [], "fields": [] } },
    "rowsByQuery": {},
    "filters": { "values": {}, "definitions": [], "set": "fn", "clear": "fn", "clearAll": "fn" }
  },
  "helpers": {
    "querySelector/querySelectorAll": "fn",
    "formatNumber/formatCompactNumber/formatValue": "fn",
    "escapeHtml/cleanFieldLabel": "fn",
    "dataSet/fieldName/value": "fn",
    "groupRows/sumField/averageField/topN/unique/sortBy": "fn",
    "getPersistentState/setPersistentState/updatePersistentState/clearPersistentState": "fn",
    "getCanonicalFilterValue/syncCanonicalFilter": "fn"
  }
}""",
        "",
        "Preferred implementation pattern:",
        "1. html only defines the stage and named slots or sections.",
        "2. css establishes the entire visual language and composition.",
        "3. If parity lane is active, js creates a small page-app flow: deriveView -> renderHero/renderKpis/renderTrend/renderStructure/renderDetail -> wireInteractions.",
        "4. If parity lane is not active, keep the lighter creative-html lane but still rely on real data and semantic sectioning rather than flat widget dumps.",
        "5. js reads context.reportData first, then falls back to helpers.dataSet(...) only for specialized sections.",
        "6. Use helpers.value(...) / helpers.fieldName(...) for resilient field access whenever raw rows are involved.",
        "7. Local presentation state must be explicitly rehydrated on remount; canonical filters must always reconcile with context.filters.",
        "8. Use helpers.getPersistentState / setPersistentState / updatePersistentState for local presentation state keyed by the current artifact identity.",
        "9. Use helpers.syncCanonicalFilter(...) or context.filters.set(...) for canonical filter mutations; never keep a private filter source of truth.",
        "10. Bindings are only used to document and validate query usage, not as the sole rendering mechanism.",
        "11. If the user did not ask for an explanation, do not render explanatory filler copy or process notes into the page.",
        "12. assistantMessage must summarize the actual visual/report change in 1-2 sentences, without validation boilerplate or technical counters.",
        "13. helpers.dataSet(...) should return a binding context; do not assume it returns raw reportData arrays directly.",
        "14. Prefer explicit semantic ids/classes such as filter-bar, hero-zone, kpi-belt, trend-zone, ranking-zone, detail-zone so modify flows can preserve them.",
        "",
        "Return JSON only in this shape:",
        """{
  "assistantMessage": "string",
  "reportName": "string",
  "reportDescription": "string",
  "runtimeHints": {
    "styleFamily": "boardroom-editorial | string",
    "layoutArchetype": "parity-operational-single-page | string",
    "designTone": "string",
    "filterPlacement": "top | left | right"
  },
  "viewport": {
    "width": 1920,
    "height": 1080,
    "mode": "fixed"
  },
  "theme": {
    "name": "string",
    "colors": {
      "primary": "#hex",
      "secondary": "#hex",
      "background": "#hex",
      "surface": "#hex",
      "text": "#hex",
      "textSecondary": "#hex",
      "chart": ["#hex", "#hex", "#hex"]
    },
    "typography": {
      "fontFamily": "string"
    }
  },
  "html": "string",
  "css": "string",
  "js": "string",
  "bindings": [
    {
      "name": "string",
      "kind": "value | metric | table | list | chart | text | html",
      "queryRef": "string",
      "label": "string",
      "description": "string",
      "shapeHint": "rows | value | series | matrix | list",
      "fields": ["string"],
      "recommendedFields": ["string"],
      "structuralFields": ["string"],
      "chartType": "line | bar | pie | area | scatter | radar | gauge",
      "orientation": "vertical | horizontal",
      "limit": 12,
      "emptyText": "string",
      "className": "string"
    }
  ],
  "usedQueryRefs": ["string", "string"]
}""",
    ])

    return "\n".join(sections)


def build_repair_prompt(
    previous_output: str,
    issues: list[str],
    context_summary: str,
    semantic_summary: str,
    current_report_summary: str | None = None,
) -> str:
    sections = [
        "Repair the previous Vibe BI creative-html JSON output.",
        "Fix only the listed issues while preserving the strong parts of the existing layout and design.",
        "Do not collapse the page into a generic equal-card dashboard during repair.",
        "Keep using page.js + context.reportData as the main rendering contract.",
        "Preserve section inventory/order, binding intent, and interaction/filter wiring unless an issue explicitly requires replacing them.",
        "Do not output markdown fences.",
        "",
        "Validation issues:",
        *[f"- {issue}" for issue in issues],
        "",
        "Semantic data summary:",
        semantic_summary.strip() or "No semantic summary was provided.",
        "",
        "Available data context:",
        context_summary.strip() or "No dataset context was provided.",
    ]

    if current_report_summary:
        sections.extend([
            "",
            "Current artifact context to preserve when possible:",
            current_report_summary.strip(),
        ])

    sections.extend([
        "",
        "Previous JSON output:",
        previous_output,
    ])
    return "\n".join(sections)


def build_reply_prompt(user_message: str, context_summary: str) -> str:
    return "\n".join([
        "Reply as a BI design and data copilot.",
        "If the user is only asking a question, answer directly and do not generate a report.",
        "Keep the answer concise but specific.",
        "",
        "User request:",
        user_message.strip(),
        "",
        "Available data context:",
        context_summary.strip() or "No dataset context was provided.",
    ])
