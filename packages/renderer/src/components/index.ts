import type { ComponentRenderer } from './registry';
import { EChartsWrapper } from './charts/EChartsWrapper';
import { KpiCard } from './kpi/KpiCard';
import { DataTable } from './table/DataTable';
import { TextBlock } from './text/TextBlock';
import { FilterCard } from './filter/FilterCard';
import type { ChartConfig, FilterComponentConfig, KpiConfig, TableConfig, TextConfig } from '@vibe-bi/core';

// Register all components
export const chartComponents: ComponentRenderer<ChartConfig>[] = [
  {
    type: 'echarts',
    component: EChartsWrapper,
    defaultConfig: {
      chartType: 'line',
      series: [],
    },
    icon: 'chart-line',
    name: 'ECharts 图表',
  },
];

export const kpiComponents: ComponentRenderer<KpiConfig>[] = [
  {
    type: 'kpi-card',
    component: KpiCard,
    defaultConfig: {
      title: 'KPI',
      valueField: '',
    },
    icon: 'gauge',
    name: 'KPI 卡片',
  },
];

export const tableComponents: ComponentRenderer<TableConfig>[] = [
  {
    type: 'data-table',
    component: DataTable,
    defaultConfig: {
      columns: [],
    },
    icon: 'table',
    name: '数据表格',
  },
];

export const textComponents: ComponentRenderer<TextConfig>[] = [
  {
    type: 'text',
    component: TextBlock,
    defaultConfig: {
      content: '',
      align: 'left',
    },
    icon: 'text',
    name: '文本',
  },
];

export const filterComponents: ComponentRenderer<FilterComponentConfig>[] = [
  {
    type: 'filter',
    component: FilterCard,
    defaultConfig: {
      filterId: '',
      label: '筛选器',
    },
    icon: 'filter',
    name: '筛选器',
  },
];

// Export all for registration
export const allComponents = [
  ...chartComponents,
  ...kpiComponents,
  ...tableComponents,
  ...textComponents,
  ...filterComponents,
] as ComponentRenderer<any>[];
