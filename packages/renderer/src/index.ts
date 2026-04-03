// Export engine components
export { ReportRenderer } from './engine/ReportRenderer';
export { PageRenderer } from './engine/PageRenderer';
export { FreeformHtmlPageRenderer } from './engine/FreeformHtmlPageRenderer';
export { CreativeHtmlPageRenderer } from './engine/CreativeHtmlPageRenderer';
export { GridLayout, GridItem } from './engine/GridLayout';
export { ComponentBridge } from './engine/ComponentBridge';

// Export component registry and registration
export { registry, registerComponent } from './components/registry';
export { allComponents } from './components';

// Import and register all components
import { registry } from './components/registry';
import { allComponents } from './components';

// Auto-register all default components
allComponents.forEach((component) => {
  registry.register(component);
});

// Export chart components
export { EChartsWrapper } from './components/charts/EChartsWrapper';
export { HtmlChartRenderer } from './components/charts/HtmlChartRenderer';

// Export KPI components
export { KpiCard } from './components/kpi/KpiCard';

// Export table components
export { DataTable } from './components/table/DataTable';

// Export data layer
export { useQueryData, clearQueryCache, primeQueryCache } from './data/useQueryData';
export { FilterProvider, useFilters } from './data/FilterContext';

// Export theme
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
