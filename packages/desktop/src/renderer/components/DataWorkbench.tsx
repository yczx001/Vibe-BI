import React, { useEffect, useMemo, useState } from 'react';
import { InfoPill, PaneCard, shellPalette } from './DesktopShell';
import { ShellIcon } from './ShellIcon';
import type {
  DatasetVisualType,
  ImportSummaryItem,
  ModelMetadata,
} from '../types/workspace';

function ghostButtonStyle(): React.CSSProperties {
  return {
    padding: '7px 10px',
    borderRadius: 8,
    border: `1px solid ${shellPalette.border}`,
    background: '#FFFFFF',
    color: shellPalette.text,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function datasetCardStyle(active: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    borderRadius: 10,
    border: `1px solid ${active ? shellPalette.accentBorder : shellPalette.border}`,
    background: active ? shellPalette.accentSoft : '#FFFFFF',
    boxShadow: active ? '0 8px 18px rgba(37, 99, 235, 0.07)' : 'none',
    overflow: 'hidden',
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${shellPalette.border}`,
  background: '#FFFFFF',
  color: shellPalette.text,
  fontSize: 13,
  boxSizing: 'border-box',
};

function compactMetaStyle(tone: 'default' | 'success' | 'accent'): React.CSSProperties {
  const colors = tone === 'success'
    ? { border: 'rgba(15, 140, 114, 0.18)', background: 'rgba(34, 201, 131, 0.1)', color: '#0F8C72' }
    : tone === 'accent'
      ? { border: 'rgba(37, 99, 235, 0.18)', background: 'rgba(37, 99, 235, 0.08)', color: '#2563EB' }
      : { border: shellPalette.border, background: '#F8FAFD', color: shellPalette.textMuted };

  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 7px',
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: colors.background,
    color: colors.color,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.2,
  };
}

const actionButtonStyle: React.CSSProperties = {
  ...ghostButtonStyle(),
  width: '100%',
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
};

function visibilityIconButtonStyle(active: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${active ? shellPalette.accentBorder : shellPalette.border}`,
    background: active ? shellPalette.accentSoft : '#FFFFFF',
    color: active ? shellPalette.accent : shellPalette.textMuted,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
}

function datasetModeLabel(mode: ImportSummaryItem['queryMode']): string {
  switch (mode) {
    case 'import-json':
      return '导入 JSON';
    case 'custom-dax':
      return '自定义 DAX';
    case 'query-builder':
      return '查询生成器';
    default:
      return mode;
  }
}

const chartTypeOptions: Array<{ value: DatasetVisualType; label: string }> = [
  { value: 'bar', label: '柱状图' },
  { value: 'line', label: '折线图' },
  { value: 'pie', label: '饼图' },
  { value: 'area', label: '面积图' },
  { value: 'scatter', label: '散点图' },
  { value: 'kpi-card', label: 'KPI 卡片' },
  { value: 'data-table', label: '数据表' },
];

export function DataWorkbench({
  modelMetadata,
  datasets,
  selectedDatasetId,
  previewPane,
  isBusy,
  onSelectDataset,
  onRenameDataset,
  onDuplicateDataset,
  onDeleteDataset,
  onRefreshDataset,
  onToggleDatasetVisibility,
  onToggleChartVisibility,
  onChangeChartType,
  onToggleFieldVisibility,
}: {
  modelMetadata: ModelMetadata | null;
  datasets: ImportSummaryItem[];
  selectedDatasetId?: string;
  previewPane: React.ReactNode;
  isBusy?: boolean;
  onSelectDataset: (datasetId: string) => void;
  onRenameDataset: (datasetId: string, name: string) => void;
  onDuplicateDataset: (datasetId: string) => void;
  onDeleteDataset: (datasetId: string) => void;
  onRefreshDataset: (datasetId: string) => Promise<void> | void;
  onToggleDatasetVisibility: (datasetId: string) => void;
  onToggleChartVisibility: (datasetId: string, chartId: string) => void;
  onChangeChartType: (datasetId: string, chartId: string, chartType: DatasetVisualType) => void;
  onToggleFieldVisibility: (datasetId: string, fieldName: string) => void;
}) {
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) || datasets[0],
    [datasets, selectedDatasetId]
  );
  const selectedChart = selectedDataset?.charts[0];
  const [renameValue, setRenameValue] = useState('');
  const [expandedDatasetIds, setExpandedDatasetIds] = useState<string[]>([]);

  useEffect(() => {
    if (selectedDataset) {
      setRenameValue(selectedDataset.name);
    }
  }, [selectedDataset]);

  useEffect(() => {
    if (!selectedDataset) {
      return;
    }

    setExpandedDatasetIds((previous) => (
      previous.includes(selectedDataset.id)
        ? previous
        : [...previous, selectedDataset.id]
    ));
  }, [selectedDataset]);

  const visibleDatasetCount = datasets.filter((dataset) => dataset.isVisible).length;
  const visibleChartCount = datasets.flatMap((dataset) => dataset.charts).filter((chart) => chart.isVisible).length;

  const toggleDatasetExpanded = (datasetId: string) => {
    setExpandedDatasetIds((previous) => (
      previous.includes(datasetId)
        ? previous.filter((item) => item !== datasetId)
        : [...previous, datasetId]
    ));
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        padding: 12,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: `
          radial-gradient(circle at top left, rgba(43, 196, 138, 0.1), transparent 24%),
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 28%),
          linear-gradient(180deg, #EEF2F7 0%, #F7F8FC 100%)
        `,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateColumns: '300px minmax(0, 1fr) 272px',
          gap: 12,
          alignItems: 'stretch',
          overflow: 'hidden',
        }}
      >
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PaneCard
            title="数据集列表"
            subtitle={`共 ${datasets.length} 个数据集${visibleDatasetCount > 0 ? `，其中 ${visibleDatasetCount} 个可见` : ''}`}
            style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
            bodyStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                flex: 1,
                minHeight: 0,
                maxHeight: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: 6,
                scrollbarGutter: 'stable',
              }}
            >
              {datasets.length === 0 ? (
                <div style={{ color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.7 }}>
                  还没有数据集。请通过顶部 Ribbon 的“导入 JSON”、“自定义”或“查询生成器”来创建。
                </div>
              ) : datasets.map((dataset) => {
                const expanded = expandedDatasetIds.includes(dataset.id);
                const active = selectedDataset?.id === dataset.id;

                return (
                  <div key={dataset.id} style={datasetCardStyle(active)}>
                    <div style={{ padding: '8px 10px', display: 'grid', gap: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => onSelectDataset(dataset.id)}
                          style={{
                            flex: 1,
                            border: 'none',
                            background: 'transparent',
                            padding: 0,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 700, lineHeight: 1.25 }}>
                            {dataset.name}
                          </div>
                        </button>
                        <div style={{ color: shellPalette.textMuted, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {dataset.rowCount} 行
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDatasetExpanded(dataset.id)}
                          title={expanded ? '收起字段' : '展开字段'}
                          aria-label={expanded ? '收起字段' : '展开字段'}
                          style={{
                            ...visibilityIconButtonStyle(active),
                            width: 28,
                            height: 28,
                            background: '#FFFFFF',
                            color: shellPalette.textMuted,
                          }}
                        >
                          <ShellIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        <span style={compactMetaStyle(dataset.isVisible ? 'success' : 'default')}>
                          {dataset.isVisible ? '可见' : '隐藏'}
                        </span>
                        <span style={compactMetaStyle(dataset.charts[0]?.isVisible ? 'accent' : 'default')}>
                          {dataset.charts[0]?.chartType || '无图表'}
                        </span>
                        <span style={compactMetaStyle('default')}>
                          {dataset.fields.filter((field) => field.isVisible).length} 字段
                        </span>
                      </div>
                    </div>

                    {expanded ? (
                      <div
                        style={{
                          flexShrink: 0,
                          borderTop: `1px solid ${shellPalette.border}`,
                          background: 'rgba(255, 255, 255, 0.72)',
                          padding: 10,
                          display: 'grid',
                          gap: 6,
                          maxHeight: 180,
                          overflowY: 'auto',
                          overflowX: 'hidden',
                        }}
                      >
                        {dataset.fields.length === 0 ? (
                          <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                            当前数据集还没有字段信息，请先执行一次查询。
                          </div>
                        ) : dataset.fields.map((field) => (
                          <div
                            key={field.name}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: `1px solid ${shellPalette.border}`,
                              background: '#FFFFFF',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: shellPalette.text, fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>
                                {field.name}
                              </div>
                              <div style={{ marginTop: 3, color: shellPalette.textMuted, fontSize: 10 }}>
                                {field.dataType}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onToggleFieldVisibility(dataset.id, field.name)}
                              title={field.isVisible ? '隐藏字段' : '显示字段'}
                              aria-label={field.isVisible ? '隐藏字段' : '显示字段'}
                              style={visibilityIconButtonStyle(field.isVisible)}
                            >
                              <ShellIcon name={field.isVisible ? 'visibility-on' : 'visibility-off'} size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </PaneCard>
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PaneCard
            title="图表预览"
            subtitle={`当前共有 ${visibleChartCount} 个可见图表素材${modelMetadata ? ` · ${modelMetadata.databaseName}` : ''}`}
            style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
            bodyStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ flex: 1, minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingRight: 6 }}>
              {previewPane}
            </div>
          </PaneCard>
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PaneCard
            title="当前数据集"
            subtitle="管理当前选中的数据集与图表状态。"
            style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
            bodyStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {selectedDataset ? (
              <div style={{ display: 'grid', gap: 12, flex: 1, minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingRight: 6 }}>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => {
                    const nextName = renameValue.trim();
                    if (nextName && nextName !== selectedDataset.name) {
                      onRenameDataset(selectedDataset.id, nextName);
                    }
                  }}
                  style={inputStyle}
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '4px 2px',
                    }}
                  >
                    <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 600 }}>
                      数据集可见性
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleDatasetVisibility(selectedDataset.id)}
                      title={selectedDataset.isVisible ? '隐藏数据集' : '显示数据集'}
                      aria-label={selectedDataset.isVisible ? '隐藏数据集' : '显示数据集'}
                      style={visibilityIconButtonStyle(selectedDataset.isVisible)}
                    >
                      <ShellIcon name={selectedDataset.isVisible ? 'visibility-on' : 'visibility-off'} size={16} />
                    </button>
                  </div>
                  {selectedChart ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '4px 2px',
                      }}
                    >
                      <div style={{ color: shellPalette.text, fontSize: 12, fontWeight: 600 }}>
                        图表可见性
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleChartVisibility(selectedDataset.id, selectedChart.id)}
                        title={selectedChart.isVisible ? '隐藏图表' : '显示图表'}
                        aria-label={selectedChart.isVisible ? '隐藏图表' : '显示图表'}
                        style={visibilityIconButtonStyle(selectedChart.isVisible)}
                      >
                        <ShellIcon name={selectedChart.isVisible ? 'visibility-on' : 'visibility-off'} size={16} />
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { void onRefreshDataset(selectedDataset.id); }}
                    disabled={Boolean(isBusy)}
                    style={actionButtonStyle}
                  >
                    {isBusy ? '刷新中...' : '刷新预览'}
                  </button>
                  <button type="button" onClick={() => onDuplicateDataset(selectedDataset.id)} style={actionButtonStyle}>
                    复制
                  </button>
                  <button type="button" onClick={() => onDeleteDataset(selectedDataset.id)} style={actionButtonStyle}>
                    删除
                  </button>
                </div>

                {selectedChart ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                      图表类型
                    </div>
                    <select
                      value={selectedChart.chartType}
                      onChange={(event) => onChangeChartType(selectedDataset.id, selectedChart.id, event.target.value as DatasetVisualType)}
                      style={inputStyle}
                    >
                      {chartTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                    当前数据集还没有图表。
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <InfoPill label="模式" value={datasetModeLabel(selectedDataset.queryMode)} tone="accent" />
                  <InfoPill label="行数" value={String(selectedDataset.rowCount)} />
                  <InfoPill label="执行时间" value={`${selectedDataset.executionTime.toFixed(0)}ms`} />
                </div>
              </div>
            ) : (
              <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
                请选择一个数据集。
              </div>
            )}
          </PaneCard>
        </div>
      </div>
    </div>
  );
}
