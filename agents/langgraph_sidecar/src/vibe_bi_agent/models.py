from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ThemeColors(BaseModel):
    primary: str
    secondary: str
    background: str
    surface: str
    text: str
    textSecondary: str
    chart: list[str] = Field(default_factory=list)


class ThemeTypography(BaseModel):
    fontFamily: str


class ComponentTheme(BaseModel):
    borderRadius: int = 20
    shadow: str = '0 24px 48px rgba(15, 23, 42, 0.16)'
    padding: int = 24


class ThemeComponents(BaseModel):
    card: ComponentTheme = Field(default_factory=ComponentTheme)


class ThemeDefinition(BaseModel):
    name: str
    colors: ThemeColors
    typography: ThemeTypography
    components: ThemeComponents = Field(default_factory=ThemeComponents)


class QueryParameter(BaseModel):
    name: str
    filterRef: str | None = None
    applyTo: str | None = None


class QueryDefinition(BaseModel):
    id: str
    name: str
    dax: str
    executionDax: str | None = None
    evaluateQueries: list[str] = Field(default_factory=list)
    selectedEvaluateIndex: int | None = None
    parameters: list[QueryParameter] = Field(default_factory=list)


class BindingFieldSchema(BaseModel):
    name: str
    label: str | None = None
    dataType: str | None = None
    semanticRole: str | None = None
    isRecommended: bool | None = None
    isStructural: bool | None = None
    isVisible: bool | None = None


class FreeformBindingDefinition(BaseModel):
    name: str
    kind: Literal['value', 'metric', 'table', 'list', 'chart', 'text', 'html']
    queryRef: str | None = None
    alias: str | None = None
    field: str | None = None
    fields: list[str] = Field(default_factory=list)
    categoryField: str | None = None
    valueField: str | None = None
    secondaryField: str | None = None
    label: str | None = None
    description: str | None = None
    shapeHint: Literal['rows', 'value', 'series', 'matrix', 'list'] | None = None
    columns: list[str] = Field(default_factory=list)
    schema: list[BindingFieldSchema] = Field(default_factory=list)
    recommendedFields: list[str] = Field(default_factory=list)
    structuralFields: list[str] = Field(default_factory=list)
    chartType: Literal['line', 'bar', 'pie', 'area', 'scatter', 'radar', 'gauge'] | None = None
    orientation: Literal['vertical', 'horizontal'] | None = None
    limit: int | None = None
    emptyText: str | None = None
    itemTemplate: str | None = None
    className: str | None = None


class CreativeViewportConfig(BaseModel):
    width: int = 1920
    height: int = 1080
    mode: Literal['fixed', 'responsive'] = 'fixed'


class PageDefinition(BaseModel):
    id: str
    name: str
    filters: list[dict[str, Any]] = Field(default_factory=list)
    components: list[dict[str, Any]] = Field(default_factory=list)
    html: str | None = None
    css: str | None = None
    js: str | None = None
    bindings: list[FreeformBindingDefinition] = Field(default_factory=list)
    viewport: CreativeViewportConfig = Field(default_factory=CreativeViewportConfig)


class ReportRuntimeHints(BaseModel):
    filterPlacement: Literal['top', 'left', 'right'] | None = None
    styleFamily: str | None = None
    layoutArchetype: str | None = None
    designTone: str | None = None


class ReportDefinition(BaseModel):
    formatVersion: str = '1.0.0'
    id: str
    name: str
    description: str | None = None
    createdAt: str
    modifiedAt: str
    generationMode: Literal['ai-generated', 'manual', 'imported'] = 'ai-generated'
    renderMode: Literal['grid', 'html-page', 'freeform-html', 'creative-html'] = 'creative-html'
    pages: list[str]
    defaultPage: str
    theme: ThemeDefinition
    runtimeHints: ReportRuntimeHints | None = None


class GeneratedArtifact(BaseModel):
    report: ReportDefinition
    pages: list[PageDefinition]
    queries: list[QueryDefinition]


class DatasetField(BaseModel):
    name: str
    label: str
    dataType: str
    isVisible: bool = True
    isRecommended: bool | None = None
    isStructural: bool | None = None
    semanticRole: str | None = None


class DatasetChart(BaseModel):
    id: str
    name: str
    componentType: str
    chartType: str
    isVisible: bool = True


class QueryResultColumn(BaseModel):
    name: str
    dataType: str | None = None


class QueryResult(BaseModel):
    columns: list[QueryResultColumn] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)


class AgentDatasetContext(BaseModel):
    id: str
    name: str
    type: str
    queryMode: str
    sourceLabel: str
    fields: list[DatasetField] = Field(default_factory=list)
    charts: list[DatasetChart] = Field(default_factory=list)
    previewResult: QueryResult | None = None
    query: QueryDefinition | None = None


class ModelMetadata(BaseModel):
    databaseName: str | None = None
    tables: list[dict[str, Any]] = Field(default_factory=list)
    measures: list[dict[str, Any]] = Field(default_factory=list)
    relationships: list[dict[str, Any]] = Field(default_factory=list)


class AgentExecutionContext(BaseModel):
    apiBaseUrl: str
    connectionString: str | None = None
    modelMetadata: ModelMetadata | None = None
    datasets: list[AgentDatasetContext] = Field(default_factory=list)
    currentReport: dict[str, Any] | None = None
    currentPages: list[dict[str, Any]] = Field(default_factory=list)
    currentQueries: list[QueryDefinition] = Field(default_factory=list)
    baselineQueries: list[QueryDefinition] = Field(default_factory=list)
    theme: dict[str, Any] | None = None


class AiAgentSettings(BaseModel):
    provider: Literal['anthropic', 'openai'] = 'anthropic'
    baseUrl: str
    apiKey: str
    model: str
    maxRepairRounds: int = Field(default=2, ge=0, le=5)
    traceVerbosity: Literal['summary', 'detailed'] = 'detailed'


class AgentRunRequest(BaseModel):
    message: str
    settings: AiAgentSettings
    context: AgentExecutionContext


class GeneratedCreativeSpec(BaseModel):
    assistantMessage: str
    reportName: str
    reportDescription: str | None = None
    runtimeHints: ReportRuntimeHints
    viewport: CreativeViewportConfig = Field(default_factory=CreativeViewportConfig)
    theme: ThemeDefinition
    html: str
    css: str
    js: str = ''
    bindings: list[FreeformBindingDefinition] = Field(default_factory=list)
    usedQueryRefs: list[str] = Field(default_factory=list)


class DesignBrief(BaseModel):
    styleFamily: str
    designTone: str
    layoutArchetype: str
    heroFocus: str
    filterPlacement: Literal['top', 'left', 'right'] = 'top'
    narrative: list[str] = Field(default_factory=list)
    mustKeep: list[str] = Field(default_factory=list)
    mustAvoid: list[str] = Field(default_factory=list)


def utc_now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
