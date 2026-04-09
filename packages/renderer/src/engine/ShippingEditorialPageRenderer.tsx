import React, { useMemo } from 'react';
import type { FilterDefinition, ReportDefinition, ThemeDefinition } from '@vibe-bi/core';
import { mixColors, withAlpha } from '../theme/colorUtils';

type DataRow = Record<string, unknown>;

interface SourceAnalysis {
  columns: string[];
  numericFields: string[];
  categoricalFields: string[];
  timeFields: string[];
  primaryValueField?: string;
  secondaryValueField?: string;
  primaryCategoryField?: string;
}

export interface ShippingSourceDataset {
  component: { id: string };
  query?: { id: string; name: string };
  rows: DataRow[];
  analysis: SourceAnalysis;
  title: string;
  chartType: string;
  orientation: string;
}

interface ShippingMetric {
  key: string;
  label: string;
  value: number;
  note: string;
}

interface ShippingTrendRow {
  monthNo: number;
  month: string;
  value: number;
  yoy: number;
  ships: number;
}

interface ShippingAggregate {
  name: string;
  count: number;
  teu?: number;
  totalDays?: number;
}

interface ShippingRankingRow {
  name: string;
  days: number;
  yoy: number;
}

interface ShippingDetailRow {
  ship: string;
  months: number[];
  total: number;
}

export interface ShippingEditorialBundle {
  title: string;
  metrics: ShippingMetric[];
  metricMap: Record<string, number>;
  trendRows: ShippingTrendRow[];
  shipTypes: ShippingAggregate[];
  shipAges: ShippingAggregate[];
  shipRanking: ShippingRankingRow[];
  detailRows: ShippingDetailRow[];
  monthLabels: string[];
  insights: {
    totalDays: number;
    topMonth: ShippingTrendRow | null;
    lowMonth: ShippingTrendRow | null;
    dominantType: ShippingAggregate | null;
    dominantAge: ShippingAggregate | null;
    topShip: ShippingRankingRow | null;
    shipCount: number;
  };
}

interface ShippingEditorialPageRendererProps {
  theme: ThemeDefinition;
  bundle: ShippingEditorialBundle;
  pageFilters?: FilterDefinition[];
  filterPlacement?: 'top' | 'left' | 'right';
  viewportMode?: 'contained' | 'document';
}

const SHIPPING_METRIC_ORDER = [
  '公司运力_载重吨',
  '公司运力_外贸_载重吨',
  '公司运力_外贸_占比',
  '公司运力_外贸_TEU箱量',
  '船舶数量',
  '运作航线',
  '月运作天数_汇总',
  '月运作天数_汇总_同比',
  '月运作天数_汇总_同比增长',
];

const SHIPPING_METRIC_META: Record<string, { label: string; note: string }> = {
  公司运力_载重吨: { label: '公司运力', note: '万吨载重吨' },
  公司运力_外贸_载重吨: { label: '外贸运力', note: '万吨载重吨' },
  公司运力_外贸_占比: { label: '外贸占比', note: '外贸运力占总运力' },
  公司运力_外贸_TEU箱量: { label: '外贸箱量', note: 'TEU' },
  船舶数量: { label: '船舶数量', note: '在役船舶数量' },
  运作航线: { label: '运作航线', note: '活跃航线数量' },
  月运作天数_汇总: { label: '运作天数', note: '全年累计运作天数' },
  月运作天数_汇总_同比: { label: '运作天数同比', note: '上年同期累计' },
  月运作天数_汇总_同比增长: { label: '同比增长', note: '按全年运作天数口径' },
};

const SHIPPING_REPORT_STYLES = `
.vibe-shipping-page {
  width: 100%;
  min-height: 100%;
  color: var(--ship-ink);
  background:
    radial-gradient(circle at 10% 0%, var(--ship-accent-soft), transparent 26%),
    radial-gradient(circle at 100% 0%, var(--ship-gold-soft), transparent 22%),
    linear-gradient(180deg, var(--ship-bg-top) 0%, var(--ship-bg-mid) 56%, var(--ship-bg-bottom) 100%);
  font-family: var(--ship-font-body);
}

.vibe-shipping-page * {
  box-sizing: border-box;
}

.vibe-shipping-page::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(var(--ship-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--ship-grid-line) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.55;
  mask-image: linear-gradient(180deg, black 60%, transparent 100%);
}

.vibe-shipping-scroll {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 100%;
  overflow: visible;
}

.vibe-shipping-page__inner {
  width: min(1580px, calc(100% - 48px));
  margin: 0 auto;
  padding-bottom: 32px;
  display: grid;
  gap: 14px;
}

.vibe-shipping-page__inner--filters-left,
.vibe-shipping-page__inner--filters-right {
  width: min(1640px, calc(100% - 40px));
  grid-template-columns: 264px minmax(0, 1fr);
  align-items: start;
  column-gap: 20px;
}

.vibe-shipping-page__inner--filters-right {
  grid-template-columns: minmax(0, 1fr) 264px;
}

.vibe-shipping-page__inner--filters-left > .vibe-shipping-filter-bar,
.vibe-shipping-page__inner--filters-left > .vibe-shipping-filter-pills {
  grid-column: 1;
}

.vibe-shipping-page__inner--filters-right > .vibe-shipping-side-rail {
  grid-column: 2;
  grid-row: 1 / span 3;
  position: sticky;
  top: 20px;
  z-index: 2;
}

.vibe-shipping-page__inner--filters-left > .vibe-shipping-topbar,
.vibe-shipping-page__inner--filters-left > .vibe-shipping-metric-grid,
.vibe-shipping-page__inner--filters-left > .vibe-shipping-main-grid,
.vibe-shipping-page__inner--filters-left > .vibe-shipping-panel,
.vibe-shipping-page__inner--filters-left > .vibe-shipping-detail-panel {
  grid-column: 2;
}

.vibe-shipping-page__inner--filters-right > .vibe-shipping-topbar,
.vibe-shipping-page__inner--filters-right > .vibe-shipping-metric-grid,
.vibe-shipping-page__inner--filters-right > .vibe-shipping-main-grid,
.vibe-shipping-page__inner--filters-right > .vibe-shipping-panel,
.vibe-shipping-page__inner--filters-right > .vibe-shipping-detail-panel {
  grid-column: 1;
}

.vibe-shipping-page__inner--filters-right > .vibe-shipping-topbar {
  grid-row: 1;
}

.vibe-shipping-page__inner--filters-right > .vibe-shipping-metric-grid {
  grid-row: 2;
}

.vibe-shipping-page__inner--filters-right > .vibe-shipping-main-grid {
  grid-row: 3;
}

.vibe-shipping-page__inner--filters-right > .vibe-shipping-panel {
  grid-row: 4;
}

.vibe-shipping-page__inner--filters-right > .vibe-shipping-detail-panel {
  grid-row: 5;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-filter-bar,
.vibe-shipping-page__inner--filters-right .vibe-shipping-filter-bar {
  grid-template-columns: 1fr;
  align-content: start;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-filter-bar {
  position: sticky;
  top: 20px;
  z-index: 2;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-filter-pills,
.vibe-shipping-page__inner--filters-right .vibe-shipping-filter-pills {
  display: grid;
  gap: 10px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-filter-pill,
.vibe-shipping-page__inner--filters-right .vibe-shipping-filter-pill {
  width: 100%;
  justify-content: space-between;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-topbar,
.vibe-shipping-page__inner--filters-right .vibe-shipping-topbar {
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.82fr);
  gap: 16px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-masthead,
.vibe-shipping-page__inner--filters-right .vibe-shipping-masthead {
  padding: 24px 26px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-title,
.vibe-shipping-page__inner--filters-right .vibe-shipping-title {
  font-size: clamp(30px, 3.1vw, 50px);
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-summary-line,
.vibe-shipping-page__inner--filters-right .vibe-shipping-summary-line {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-briefing,
.vibe-shipping-page__inner--filters-right .vibe-shipping-briefing {
  padding: 22px 22px 20px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-headline,
.vibe-shipping-page__inner--filters-right .vibe-shipping-headline {
  font-size: clamp(38px, 4.2vw, 66px);
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-metric-grid,
.vibe-shipping-page__inner--filters-right .vibe-shipping-metric-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-main-grid,
.vibe-shipping-page__inner--filters-right .vibe-shipping-main-grid {
  grid-template-columns: minmax(0, 1.24fr) minmax(300px, 0.8fr);
  gap: 16px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-structure-grid,
.vibe-shipping-page__inner--filters-right .vibe-shipping-structure-grid {
  grid-template-columns: minmax(0, 1.12fr) 260px;
  gap: 16px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-panel,
.vibe-shipping-page__inner--filters-left .vibe-shipping-detail-panel,
.vibe-shipping-page__inner--filters-right .vibe-shipping-panel,
.vibe-shipping-page__inner--filters-right .vibe-shipping-detail-panel {
  padding: 20px 22px 22px;
}

.vibe-shipping-page__inner--filters-left .vibe-shipping-panel-title,
.vibe-shipping-page__inner--filters-right .vibe-shipping-panel-title {
  font-size: 25px;
}

.vibe-shipping-side-rail {
  position: relative;
  padding: 18px;
  display: grid;
  gap: 14px;
  color: white;
  border-radius: 30px;
  border: 1px solid var(--ship-panel-line);
  box-shadow: 0 18px 42px var(--ship-shadow);
  backdrop-filter: blur(var(--ship-blur));
  background:
    linear-gradient(180deg, var(--ship-brief-top), var(--ship-brief-bottom)),
    radial-gradient(circle at top right, var(--ship-brief-glow), transparent 38%);
  overflow: hidden;
}

.vibe-shipping-side-rail::after {
  content: "";
  position: absolute;
  inset: auto -50px -64px auto;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.08);
}

.vibe-shipping-rail-kicker {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.68);
  font-weight: 700;
}

.vibe-shipping-rail-title {
  margin: 6px 0 0;
  font-family: var(--ship-font-display);
  font-size: 30px;
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.vibe-shipping-rail-subline {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255,255,255,0.76);
}

.vibe-shipping-side-rail .vibe-shipping-filter-bar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.vibe-shipping-side-rail .vibe-shipping-filter-card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: none;
}

.vibe-shipping-side-rail .vibe-shipping-filter-label,
.vibe-shipping-side-rail .vibe-shipping-filter-caption {
  color: rgba(255,255,255,0.72);
}

.vibe-shipping-side-rail .vibe-shipping-filter-control {
  background: rgba(15, 33, 53, 0.36);
  border-color: rgba(255,255,255,0.12);
  color: white;
}

.vibe-shipping-side-rail .vibe-shipping-filter-pills {
  gap: 8px;
}

.vibe-shipping-side-rail .vibe-shipping-filter-pill {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.12);
  color: white;
}

.vibe-shipping-rail-stats {
  display: grid;
  gap: 10px;
}

.vibe-shipping-rail-stat {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.08);
}

.vibe-shipping-rail-stat-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.64);
}

.vibe-shipping-rail-stat-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.vibe-shipping-rail-stat-note {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(255,255,255,0.72);
}

.vibe-shipping-card {
  background: var(--ship-panel);
  border: 1px solid var(--ship-panel-line);
  border-radius: 30px;
  box-shadow: 0 18px 42px var(--ship-shadow);
  backdrop-filter: blur(var(--ship-blur));
}

.vibe-shipping-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1.28fr) minmax(400px, 0.82fr);
  gap: 12px;
  align-items: stretch;
}

.vibe-shipping-masthead {
  padding: 20px 22px;
  background:
    linear-gradient(135deg, var(--ship-panel-strong), var(--ship-panel-soft)),
    radial-gradient(circle at 100% 0%, var(--ship-accent-glow), transparent 38%);
  overflow: hidden;
  position: relative;
}

.vibe-shipping-masthead::after {
  content: "";
  position: absolute;
  right: -54px;
  top: -26px;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  border: 1px solid var(--ship-ring-line);
  box-shadow: inset 0 0 0 22px var(--ship-ring-fill);
}

.vibe-shipping-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--ship-badge-bg);
  color: var(--ship-navy);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-weight: 700;
}

.vibe-shipping-eyebrow::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--ship-teal), var(--ship-cyan));
  box-shadow: 0 0 0 4px var(--ship-dot-ring);
}

.vibe-shipping-title {
  margin: 14px 0 0;
  font-family: var(--ship-font-display);
  font-size: clamp(28px, 3.4vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.05em;
}

.vibe-shipping-summary-line {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.vibe-shipping-summary-item {
  padding: 10px 12px 10px;
  border-radius: 16px;
  background: var(--ship-panel-soft);
  border: 1px solid var(--ship-line);
}

.vibe-shipping-summary-name {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ship-muted);
}

.vibe-shipping-summary-value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.vibe-shipping-briefing {
  padding: 18px 18px 16px;
  background:
    linear-gradient(180deg, var(--ship-brief-top), var(--ship-brief-bottom)),
    radial-gradient(circle at top right, var(--ship-brief-glow), transparent 36%);
  color: white;
  position: relative;
  overflow: hidden;
}

.vibe-shipping-briefing::after {
  content: "";
  position: absolute;
  inset: auto -42px -52px auto;
  width: 210px;
  height: 210px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.1);
}

.vibe-shipping-kicker {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.68);
  font-weight: 700;
}

.vibe-shipping-headline {
  margin-top: 8px;
  font-family: var(--ship-font-display);
  font-size: clamp(36px, 4.1vw, 64px);
  line-height: 0.92;
  letter-spacing: -0.07em;
}

.vibe-shipping-subline {
  margin-top: 6px;
  color: rgba(255,255,255,0.76);
  font-size: 13px;
}

.vibe-shipping-insight-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.vibe-shipping-insight-list li {
  padding: 9px 11px;
  border-radius: 16px;
  background: var(--ship-brief-card-bg);
  border: 1px solid var(--ship-brief-card-line);
  color: rgba(255,255,255,0.9);
  line-height: 1.4;
}

.vibe-shipping-metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.vibe-shipping-filter-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.vibe-shipping-filter-card {
  padding: 10px 12px;
  display: grid;
  gap: 6px;
  background: var(--ship-panel-soft);
}

.vibe-shipping-filter-label {
  color: var(--ship-muted);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
}

.vibe-shipping-filter-control {
  width: 100%;
  border: 1px solid var(--ship-line);
  border-radius: 12px;
  background: var(--ship-control-bg);
  color: var(--ship-ink);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  outline: none;
}

.vibe-shipping-filter-caption {
  color: var(--ship-muted);
  font-size: 10px;
  line-height: 1.4;
  opacity: 0.84;
}

.vibe-shipping-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.vibe-shipping-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--ship-pill-bg);
  border: 1px solid var(--ship-line);
  color: var(--ship-navy);
  font-size: 12px;
  font-weight: 700;
}

.vibe-shipping-metric-card {
  padding: 16px 16px 14px;
  background: var(--ship-panel-soft);
  position: relative;
  overflow: hidden;
}

.vibe-shipping-metric-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, var(--ship-cyan), var(--ship-teal));
}

.vibe-shipping-metric-label {
  color: var(--ship-muted);
  font-size: 12px;
  min-height: 18px;
}

.vibe-shipping-metric-value {
  margin-top: 8px;
  font-family: var(--ship-font-display);
  font-size: 31px;
  line-height: 1;
  letter-spacing: -0.05em;
}

.vibe-shipping-metric-note {
  margin-top: 8px;
  color: var(--ship-muted);
  font-size: 11px;
  line-height: 1.45;
}

.vibe-shipping-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(380px, 0.95fr);
  gap: 14px;
  align-items: start;
}

.vibe-shipping-panel {
  padding: 22px 24px 24px;
}

.vibe-shipping-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 16px;
}

.vibe-shipping-panel-title {
  font-family: var(--ship-font-display);
  font-size: 28px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.vibe-shipping-panel-note {
  color: var(--ship-muted);
  font-size: 13px;
  line-height: 1.5;
}

.vibe-shipping-chart-shell {
  padding: 12px 14px 14px;
  border-radius: 22px;
  background: linear-gradient(180deg, var(--ship-chart-top), var(--ship-chart-bottom));
  border: 1px solid var(--ship-line);
}

.vibe-shipping-trend-stats {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.vibe-shipping-trend-stat {
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: var(--ship-panel-soft);
  border: 1px solid var(--ship-line);
}

.vibe-shipping-trend-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ship-muted);
}

.vibe-shipping-trend-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.vibe-shipping-side-stack {
  display: grid;
  gap: 18px;
}

.vibe-shipping-rank-list {
  display: grid;
  gap: 12px;
}

.vibe-shipping-rank-row {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  background: var(--ship-panel-soft);
  border: 1px solid var(--ship-line);
}

.vibe-shipping-rank-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  font-size: 13px;
}

.vibe-shipping-rank-name {
  font-weight: 700;
  font-size: 14px;
}

.vibe-shipping-rank-value {
  color: var(--ship-muted);
  white-space: nowrap;
}

.vibe-shipping-rank-track,
.vibe-shipping-type-track,
.vibe-shipping-age-track {
  height: 10px;
  border-radius: 999px;
  background: var(--ship-track);
  overflow: hidden;
}

.vibe-shipping-rank-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ship-cyan), var(--ship-teal));
}

.vibe-shipping-structure-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
  align-items: stretch;
}

.vibe-shipping-type-table {
  display: grid;
  gap: 12px;
}

.vibe-shipping-type-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 70px;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 18px;
  background: var(--ship-panel-soft);
  border: 1px solid var(--ship-line);
}

.vibe-shipping-type-name {
  font-family: var(--ship-font-display);
  font-size: 24px;
  letter-spacing: -0.04em;
}

.vibe-shipping-type-fill,
.vibe-shipping-age-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ship-gold), var(--ship-teal));
}

.vibe-shipping-type-share {
  text-align: right;
  font-weight: 700;
  color: var(--ship-navy);
}

.vibe-shipping-age-panel {
  padding: 18px;
  border-radius: 22px;
  background: linear-gradient(180deg, var(--ship-brief-top), var(--ship-brief-bottom));
  color: white;
}

.vibe-shipping-age-total {
  font-family: var(--ship-font-display);
  font-size: 58px;
  line-height: 0.9;
  letter-spacing: -0.06em;
}

.vibe-shipping-age-caption {
  margin-top: 8px;
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.vibe-shipping-age-list {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.vibe-shipping-age-row {
  display: grid;
  gap: 8px;
}

.vibe-shipping-age-row-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  font-size: 13px;
}

.vibe-shipping-detail-panel {
  padding: 22px 24px 24px;
}

.vibe-shipping-detail-wrap {
  overflow: auto;
  max-height: 560px;
}

.vibe-shipping-detail-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.vibe-shipping-detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 10px;
  text-align: left;
  color: var(--ship-muted);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: var(--ship-table-head);
  border-bottom: 1px solid var(--ship-line);
}

.vibe-shipping-detail-table tbody td {
  padding: 10px;
  border-bottom: 1px solid var(--ship-row-line);
}

.vibe-shipping-detail-table tbody tr:hover td {
  background: var(--ship-row-hover);
}

.vibe-shipping-ship-cell {
  font-weight: 700;
  min-width: 116px;
  background: var(--ship-sticky-cell);
  position: sticky;
  left: 0;
  z-index: 1;
}

.vibe-shipping-heat {
  text-align: center;
  border-radius: 12px;
  padding: 8px 6px;
  font-variant-numeric: tabular-nums;
}

.vibe-shipping-total-cell {
  white-space: nowrap;
  font-weight: 700;
  color: var(--ship-navy);
}

.vibe-shipping-mono {
  font-family: var(--ship-font-mono);
}

@media (max-width: 1320px) {
  .vibe-shipping-page__inner--filters-left,
  .vibe-shipping-page__inner--filters-right {
    grid-template-columns: 1fr;
  }

  .vibe-shipping-page__inner--filters-right > .vibe-shipping-side-rail,
  .vibe-shipping-page__inner--filters-left > .vibe-shipping-filter-bar,
  .vibe-shipping-page__inner--filters-left > .vibe-shipping-filter-pills,
  .vibe-shipping-page__inner--filters-left > .vibe-shipping-topbar,
  .vibe-shipping-page__inner--filters-left > .vibe-shipping-metric-grid,
  .vibe-shipping-page__inner--filters-left > .vibe-shipping-main-grid,
  .vibe-shipping-page__inner--filters-left > .vibe-shipping-panel,
  .vibe-shipping-page__inner--filters-left > .vibe-shipping-detail-panel,
  .vibe-shipping-page__inner--filters-right > .vibe-shipping-filter-bar,
  .vibe-shipping-page__inner--filters-right > .vibe-shipping-filter-pills,
  .vibe-shipping-page__inner--filters-right > .vibe-shipping-topbar,
  .vibe-shipping-page__inner--filters-right > .vibe-shipping-metric-grid,
  .vibe-shipping-page__inner--filters-right > .vibe-shipping-main-grid,
  .vibe-shipping-page__inner--filters-right > .vibe-shipping-panel,
  .vibe-shipping-page__inner--filters-right > .vibe-shipping-detail-panel {
    grid-column: 1;
  }

  .vibe-shipping-topbar,
  .vibe-shipping-main-grid,
  .vibe-shipping-structure-grid,
  .vibe-shipping-filter-bar {
    grid-template-columns: 1fr;
  }

  .vibe-shipping-metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .vibe-shipping-summary-line,
  .vibe-shipping-trend-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .vibe-shipping-page__inner {
    width: min(100vw - 24px, 100%);
  }

  .vibe-shipping-metric-grid,
  .vibe-shipping-summary-line,
  .vibe-shipping-trend-stats {
    grid-template-columns: 1fr;
  }

  .vibe-shipping-type-row {
    grid-template-columns: 1fr;
  }
}
`;

export function buildShippingEditorialBundle(
  report: ReportDefinition,
  datasets: ShippingSourceDataset[],
): ShippingEditorialBundle | null {
  const styleFamily = normalizeStyleFamily(report.runtimeHints?.styleFamily);
  if (styleFamily && styleFamily !== 'shipping-ops') {
    return null;
  }

  const metricMap = collectMetricMap(datasets);
  const trendRows = buildTrendRows(selectTrendDataset(datasets));
  const shipTypes = buildTypeRows(selectTypeDataset(datasets));
  const shipAges = buildAgeRows(selectAgeDataset(datasets));
  const shipRanking = buildRankingRows(selectRankingDataset(datasets));
  const detailRows = buildDetailRows(selectDetailDataset(datasets), trendRows.length || 12);
  const monthLabels = trendRows.length > 0
    ? trendRows.map((row) => row.month)
    : buildMonthLabels(detailRows);

  const dominantType = shipTypes[0] ?? null;
  const dominantAge = shipAges[0] ?? null;
  const topShip = shipRanking[0] ?? null;
  const topMonth = trendRows.slice().sort((left, right) => right.value - left.value)[0] ?? null;
  const lowMonth = trendRows.slice().sort((left, right) => left.value - right.value)[0] ?? null;
  const totalDays = trendRows.reduce((sum, row) => sum + row.value, 0)
    || metricMap['月运作天数_汇总']
    || detailRows.reduce((sum, row) => sum + row.total, 0);

  const metrics = SHIPPING_METRIC_ORDER
    .filter((key) => Number.isFinite(metricMap[key]))
    .map((key) => ({
      key,
      label: SHIPPING_METRIC_META[key]?.label || prettifyMetricLabel(key),
      value: metricMap[key],
      note: SHIPPING_METRIC_META[key]?.note || '来自当前查询结果',
    }));

  if (metrics.length < 4 || trendRows.length < 6 || detailRows.length < 4) {
    return null;
  }

  return {
    title: normalizeReportTitle(report.name),
    metrics,
    metricMap,
    trendRows,
    shipTypes,
    shipAges,
    shipRanking,
    detailRows,
    monthLabels,
    insights: {
      totalDays,
      topMonth,
      lowMonth,
      dominantType,
      dominantAge,
      topShip,
      shipCount: metricMap['船舶数量'] || detailRows.length,
    },
  };
}

function normalizeStyleFamily(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized.includes('shipping')
    || normalized.includes('航运')
    || normalized.includes('boardroom')
    || normalized.includes('editorial')
    || normalized.includes('海运')
  ) {
    return 'shipping-ops';
  }

  if (normalized.includes('brutal') || normalized.includes('粗野')) {
    return 'brutalist';
  }

  if (normalized.includes('magazine') || normalized.includes('海报') || normalized.includes('杂志')) {
    return 'magazine';
  }

  if (normalized.includes('studio') || normalized.includes('minimal') || normalized.includes('极简')) {
    return 'studio';
  }

  if (normalized.includes('noir') || normalized.includes('电影') || normalized.includes('午夜')) {
    return 'noir';
  }

  if (normalized.includes('atlas')) {
    return 'editorial-atlas';
  }

  if (normalized.includes('harbor') || normalized.includes('ledger') || normalized.includes('台账')) {
    return 'editorial-harbor';
  }

  return normalized;
}

export function ShippingEditorialPageRenderer({
  theme,
  bundle,
  pageFilters = [],
  filterPlacement = 'top',
  viewportMode = 'contained',
}: ShippingEditorialPageRendererProps) {
  const resolvedFilterPlacement = filterPlacement === 'left' || filterPlacement === 'right'
    ? filterPlacement
    : 'top';
  const monthWindowOptions = useMemo(() => ([
    { value: 'all', label: '全年' },
    { value: 'h1', label: '上半年' },
    { value: 'h2', label: '下半年' },
    { value: 'q1', label: 'Q1' },
    { value: 'q2', label: 'Q2' },
    { value: 'q3', label: 'Q3' },
    { value: 'q4', label: 'Q4' },
  ]), []);
  const shipOptions = useMemo(
    () => ['全部', ...bundle.detailRows.map((row) => row.ship)],
    [bundle.detailRows]
  );
  const [selectedShip, setSelectedShip] = React.useState('全部');
  const [selectedMonthWindow, setSelectedMonthWindow] = React.useState('all');
  const [selectedTopN, setSelectedTopN] = React.useState(8);

  const visibleMonthIndices = useMemo(
    () => getMonthWindowIndices(selectedMonthWindow, bundle.monthLabels.length),
    [bundle.monthLabels.length, selectedMonthWindow]
  );
  const displayedMonthLabels = useMemo(
    () => visibleMonthIndices.map((index: number) => bundle.monthLabels[index] || `${index + 1}月`),
    [bundle.monthLabels, visibleMonthIndices]
  );
  const scopedDetailRows = useMemo(() => {
    const baseRows = selectedShip === '全部'
      ? bundle.detailRows
      : bundle.detailRows.filter((row) => row.ship === selectedShip);

    return baseRows
      .map((row) => ({
        ...row,
        months: visibleMonthIndices.map((index: number) => row.months[index] ?? 0),
      }))
      .map((row) => ({
        ...row,
        total: row.months.reduce((sum: number, value: number) => sum + value, 0),
      }))
      .sort((left, right) => right.total - left.total)
      .slice(0, Math.max(1, selectedTopN));
  }, [bundle.detailRows, selectedShip, selectedTopN, visibleMonthIndices]);
  const scopedTrendRows = useMemo(() => {
    if (selectedShip !== '全部') {
      const shipDetail = bundle.detailRows.find((row) => row.ship === selectedShip);
      if (shipDetail) {
        return visibleMonthIndices.map((index: number) => ({
          monthNo: index + 1,
          month: bundle.monthLabels[index] || `${index + 1}月`,
          value: shipDetail.months[index] ?? 0,
          yoy: 0,
          ships: 1,
        }));
      }
    }

    return visibleMonthIndices
      .map((index: number) => bundle.trendRows[index])
      .filter((row: ShippingTrendRow | undefined): row is ShippingTrendRow => Boolean(row));
  }, [bundle.detailRows, bundle.monthLabels, bundle.trendRows, selectedShip, visibleMonthIndices]);
  const scopedRanking = useMemo(() => {
    if (selectedShip !== '全部') {
      return bundle.shipRanking.filter((row) => row.name === selectedShip);
    }

    return bundle.shipRanking.slice(0, Math.max(1, selectedTopN));
  }, [bundle.shipRanking, selectedShip, selectedTopN]);

  const shipTotal = Math.max(1, bundle.shipTypes.reduce((sum, item) => sum + item.count, 0));
  const ageTotal = Math.max(1, bundle.shipAges.reduce((sum, item) => sum + item.count, 0));
  const topMonth = scopedTrendRows.slice().sort((left: ShippingTrendRow, right: ShippingTrendRow) => right.value - left.value)[0] ?? null;
  const lowMonth = scopedTrendRows.slice().sort((left: ShippingTrendRow, right: ShippingTrendRow) => left.value - right.value)[0] ?? null;
  const scopedTotalDays = scopedTrendRows.reduce((sum: number, row: ShippingTrendRow) => sum + row.value, 0);
  const avgMonth = scopedTotalDays / Math.max(1, scopedTrendRows.length);
  const foreignShare = percentValue(bundle.metricMap['公司运力_外贸_占比']);
  const yoyGrowth = percentValue(bundle.metricMap['月运作天数_汇总_同比增长']);
  const heatMax = Math.max(...scopedDetailRows.flatMap((item) => item.months), 1);

  const cssVars = useMemo<React.CSSProperties>(() => {
    const background = theme.colors.background || '#eef3f7';
    const surface = theme.colors.surface || '#ffffff';
    const text = theme.colors.text || '#0f1b2d';
    const muted = theme.colors.textSecondary || mixColors(text, background, 0.4, '#627287');
    const cyan = theme.colors.primary || '#1a7fa7';
    const gold = theme.colors.secondary || '#d2a645';
    const navy = mixColors(text, '#12395a', 0.65, '#12395a');
    const teal = mixColors(cyan, '#11a28b', 0.55, '#11a28b');
    const isLightMode = !isDarkColor(background);
    const panelBase = isLightMode
      ? mixColors(surface, background, 0.9, surface)
      : mixColors(surface, background, 0.88, surface);
    const panelStrong = isLightMode
      ? mixColors('#ffffff', surface, 0.94, '#ffffff')
      : mixColors(surface, background, 0.94, surface);
    const panelSoft = isLightMode
      ? mixColors(surface, background, 0.82, surface)
      : mixColors(surface, background, 0.82, surface);
    const panelLine = isLightMode
      ? withAlpha(text, 0.08, 'rgba(15,23,42,0.08)')
      : withAlpha(text, 0.12, 'rgba(232,238,242,0.12)');
    const controlBg = isLightMode
      ? mixColors('#ffffff', background, 0.9, '#ffffff')
      : mixColors(surface, background, 0.8, surface);
    const pillBg = isLightMode
      ? mixColors(surface, background, 0.86, surface)
      : mixColors(surface, background, 0.76, surface);
    const chartTop = isLightMode
      ? mixColors(surface, '#edf3f8', 0.72, surface)
      : mixColors(surface, background, 0.84, surface);
    const chartBottom = isLightMode
      ? mixColors(surface, background, 0.9, surface)
      : mixColors(surface, background, 0.78, surface);
    const stickyCell = isLightMode
      ? mixColors(surface, background, 0.92, surface)
      : mixColors(surface, background, 0.9, surface);
    const briefTop = isLightMode
      ? mixColors(navy, '#12395a', 0.92, '#12395a')
      : mixColors(navy, '#0b2238', 0.82, '#0b2238');
    const briefBottom = isLightMode
      ? mixColors(navy, '#174a67', 0.88, '#174a67')
      : mixColors(navy, '#102d47', 0.78, '#102d47');
    const briefGlow = isLightMode
      ? withAlpha(teal, 0.22, 'rgba(17,162,139,0.22)')
      : withAlpha(teal, 0.12, 'rgba(17,162,139,0.12)');
    const briefCardBg = isLightMode
      ? withAlpha('#ffffff', 0.08, 'rgba(255,255,255,0.08)')
      : withAlpha('#0f2135', 0.72, 'rgba(15,33,53,0.72)');
    const briefCardLine = isLightMode
      ? withAlpha('#ffffff', 0.08, 'rgba(255,255,255,0.08)')
      : withAlpha('#8ba4c7', 0.12, 'rgba(139,164,199,0.12)');

    return {
      '--ship-bg-top': mixColors(background, '#ffffff', 0.84, background),
      '--ship-bg-mid': mixColors(background, '#edf3f8', 0.9, background),
      '--ship-bg-bottom': mixColors(background, '#e8eff5', 0.92, background),
      '--ship-panel': panelBase,
      '--ship-panel-strong': panelStrong,
      '--ship-panel-soft': panelSoft,
      '--ship-panel-line': panelLine,
      '--ship-line': withAlpha(text, 0.09, 'rgba(15,23,42,0.09)'),
      '--ship-grid-line': withAlpha(navy, 0.035, 'rgba(18,57,90,0.035)'),
      '--ship-row-line': withAlpha(text, 0.06, 'rgba(15,23,42,0.06)'),
      '--ship-row-hover': withAlpha(teal, 0.04, 'rgba(17,162,139,0.04)'),
      '--ship-track': withAlpha(navy, 0.08, 'rgba(18,57,90,0.08)'),
      '--ship-shadow': withAlpha(navy, isLightMode ? 0.1 : 0.12, 'rgba(16,35,58,0.12)'),
      '--ship-chart-top': chartTop,
      '--ship-chart-bottom': chartBottom,
      '--ship-table-head': '#f4f8fb',
      '--ship-sticky-cell': stickyCell,
      '--ship-badge-bg': withAlpha(navy, 0.06, 'rgba(18,57,90,0.06)'),
      '--ship-dot-ring': withAlpha(teal, 0.12, 'rgba(17,162,139,0.12)'),
      '--ship-ring-line': withAlpha(navy, 0.08, 'rgba(18,57,90,0.08)'),
      '--ship-ring-fill': withAlpha(navy, 0.03, 'rgba(18,57,90,0.03)'),
      '--ship-accent-soft': withAlpha(teal, 0.14, 'rgba(17,162,139,0.14)'),
      '--ship-gold-soft': withAlpha(gold, 0.14, 'rgba(210,166,69,0.14)'),
      '--ship-accent-glow': withAlpha(teal, 0.18, 'rgba(17,162,139,0.18)'),
      '--ship-brief-top': briefTop,
      '--ship-brief-bottom': briefBottom,
      '--ship-brief-glow': briefGlow,
      '--ship-brief-card-bg': briefCardBg,
      '--ship-brief-card-line': briefCardLine,
      '--ship-control-bg': controlBg,
      '--ship-pill-bg': pillBg,
      '--ship-blur': isLightMode ? '8px' : '18px',
      '--ship-bg': background,
      '--ship-ink': text,
      '--ship-muted': muted,
      '--ship-cyan': cyan,
      '--ship-teal': teal,
      '--ship-gold': gold,
      '--ship-navy': navy,
      '--ship-font-display': '"Bahnschrift", "Segoe UI Variable Display", "Microsoft YaHei UI", sans-serif',
      '--ship-font-body': theme.typography.fontFamily || '"Segoe UI Variable Text", "Microsoft YaHei UI", "PingFang SC", sans-serif',
      '--ship-font-mono': '"Cascadia Code", "Consolas", monospace',
    } as React.CSSProperties;
  }, [theme]);

  const topMetrics = bundle.metrics.slice(0, 6);
  const sideRail = resolvedFilterPlacement === 'right' ? (
    <aside className="vibe-shipping-side-rail">
      <div>
        <div className="vibe-shipping-rail-kicker">Command Deck</div>
        <h2 className="vibe-shipping-rail-title">筛选与聚焦</h2>
        <div className="vibe-shipping-rail-subline">
          侧栏不再只是承接控件，而是同步给出当前观察焦点，便于在单页内完成筛选与解读。
        </div>
      </div>

      <section className="vibe-shipping-filter-bar">
        <article className="vibe-shipping-filter-card">
          <div className="vibe-shipping-filter-label">关注船舶</div>
          <select className="vibe-shipping-filter-control" value={selectedShip} onChange={(event) => setSelectedShip(event.target.value)}>
            {shipOptions.map((ship) => (
              <option key={ship} value={ship}>{ship}</option>
            ))}
          </select>
          <div className="vibe-shipping-filter-caption">切换到单船后，趋势、头部列表和月度明细会同步聚焦该船舶。</div>
        </article>

        <article className="vibe-shipping-filter-card">
          <div className="vibe-shipping-filter-label">时间范围</div>
          <select className="vibe-shipping-filter-control" value={selectedMonthWindow} onChange={(event) => setSelectedMonthWindow(event.target.value)}>
            {monthWindowOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className="vibe-shipping-filter-caption">控制趋势图和月度明细显示的月份范围，避免在画布内信息过密。</div>
        </article>

        <article className="vibe-shipping-filter-card">
          <div className="vibe-shipping-filter-label">显示数量</div>
          <select className="vibe-shipping-filter-control" value={String(selectedTopN)} onChange={(event) => setSelectedTopN(Number(event.target.value))}>
            {[5, 8, 10].map((count) => (
              <option key={count} value={String(count)}>前 {count} 项</option>
            ))}
          </select>
          <div className="vibe-shipping-filter-caption">控制头部船舶和月度明细的显示数量，减少阅读噪音。</div>
        </article>
      </section>

      {pageFilters.length > 0 ? (
        <div className="vibe-shipping-filter-pills">
          {pageFilters.map((filter) => (
            <div key={filter.id} className="vibe-shipping-filter-pill">
              <span>{filter.target.column}</span>
              <span>{filter.type}</span>
            </div>
          ))}
        </div>
      ) : null}

      <section className="vibe-shipping-rail-stats">
        {bundle.insights.topShip ? (
          <article className="vibe-shipping-rail-stat">
            <div className="vibe-shipping-rail-stat-label">头部船舶</div>
            <div className="vibe-shipping-rail-stat-value">{bundle.insights.topShip.name}</div>
            <div className="vibe-shipping-rail-stat-note">
              {formatNumber(bundle.insights.topShip.days, 1)} 天 / 同比 {formatPercent(bundle.insights.topShip.yoy, 1)}
            </div>
          </article>
        ) : null}
        {bundle.insights.dominantType ? (
          <article className="vibe-shipping-rail-stat">
            <div className="vibe-shipping-rail-stat-label">主力船型</div>
            <div className="vibe-shipping-rail-stat-value">{bundle.insights.dominantType.name}</div>
            <div className="vibe-shipping-rail-stat-note">
              {bundle.insights.dominantType.count} 艘 / {formatPercent((bundle.insights.dominantType.count / Math.max(shipTotal, 1)) * 100, 1)}
            </div>
          </article>
        ) : null}
      </section>
    </aside>
  ) : null;

  return (
    <div
      className={`vibe-shipping-page vibe-shipping-page--${viewportMode}`}
      style={{
        ...cssVars,
        height: viewportMode === 'contained' ? '100%' : 'auto',
        minHeight: viewportMode === 'contained' ? '100%' : 1080,
      }}
    >
      <style>{SHIPPING_REPORT_STYLES}</style>
      <div
        className="vibe-shipping-scroll"
        style={{
          minHeight: viewportMode === 'contained' ? '100%' : 'auto',
          overflow: viewportMode === 'contained' ? 'auto' : 'visible',
        }}
      >
        <main className={`vibe-shipping-page__inner vibe-shipping-page__inner--filters-${resolvedFilterPlacement}`}>
          {resolvedFilterPlacement === 'right' ? sideRail : (
            <>
              <section className="vibe-shipping-filter-bar">
                <article className="vibe-shipping-card vibe-shipping-filter-card">
                  <div className="vibe-shipping-filter-label">关注船舶</div>
                  <select className="vibe-shipping-filter-control" value={selectedShip} onChange={(event) => setSelectedShip(event.target.value)}>
                    {shipOptions.map((ship) => (
                      <option key={ship} value={ship}>{ship}</option>
                    ))}
                  </select>
                  <div className="vibe-shipping-filter-caption">切换到单船后，趋势、头部列表和月度明细会同步聚焦该船舶。</div>
                </article>

                <article className="vibe-shipping-card vibe-shipping-filter-card">
                  <div className="vibe-shipping-filter-label">时间范围</div>
                  <select className="vibe-shipping-filter-control" value={selectedMonthWindow} onChange={(event) => setSelectedMonthWindow(event.target.value)}>
                    {monthWindowOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className="vibe-shipping-filter-caption">控制趋势图和月度明细显示的月份范围，避免在画布内信息过密。</div>
                </article>

                <article className="vibe-shipping-card vibe-shipping-filter-card">
                  <div className="vibe-shipping-filter-label">显示数量</div>
                  <select className="vibe-shipping-filter-control" value={String(selectedTopN)} onChange={(event) => setSelectedTopN(Number(event.target.value))}>
                    {[5, 8, 10].map((count) => (
                      <option key={count} value={String(count)}>前 {count} 项</option>
                    ))}
                  </select>
                  <div className="vibe-shipping-filter-caption">控制头部船舶和月度明细的显示数量，减少阅读噪音。</div>
                </article>
              </section>

              {pageFilters.length > 0 ? (
                <div className="vibe-shipping-filter-pills">
                  {pageFilters.map((filter) => (
                    <div key={filter.id} className="vibe-shipping-filter-pill">
                      <span>{filter.target.column}</span>
                      <span>{filter.type}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}

          <section className="vibe-shipping-topbar">
            <article className="vibe-shipping-card vibe-shipping-masthead">
              <div className="vibe-shipping-eyebrow">Harbor Operations</div>
              <h1 className="vibe-shipping-title">{bundle.title}</h1>
              <div className="vibe-shipping-summary-line">
                <div className="vibe-shipping-summary-item">
                  <div className="vibe-shipping-summary-name">峰值月份</div>
                  <div className="vibe-shipping-summary-value vibe-shipping-mono">{topMonth?.month || '-'}</div>
                </div>
                <div className="vibe-shipping-summary-item">
                  <div className="vibe-shipping-summary-name">月均运作</div>
                  <div className="vibe-shipping-summary-value vibe-shipping-mono">{formatNumber(avgMonth, 1)}</div>
                </div>
                <div className="vibe-shipping-summary-item">
                  <div className="vibe-shipping-summary-name">外贸占比</div>
                  <div className="vibe-shipping-summary-value vibe-shipping-mono">{formatPercent(foreignShare, 1)}</div>
                </div>
                <div className="vibe-shipping-summary-item">
                  <div className="vibe-shipping-summary-name">在役船舶</div>
                  <div className="vibe-shipping-summary-value vibe-shipping-mono">{formatNumber(bundle.insights.shipCount, 0)}</div>
                </div>
              </div>
            </article>

            <article className="vibe-shipping-card vibe-shipping-briefing">
              <div className="vibe-shipping-kicker">Annual Briefing</div>
              <div className="vibe-shipping-headline vibe-shipping-mono">{formatNumber(scopedTotalDays, 0)}</div>
              <div className="vibe-shipping-subline">全年累计运作天数</div>
              <ul className="vibe-shipping-insight-list">
                {topMonth && lowMonth ? (
                  <li>
                    {topMonth.month}达到全年峰值 {formatNumber(topMonth.value, 1)} 天，较最低月 {lowMonth.month}高出 {formatNumber(topMonth.value - lowMonth.value, 1)} 天。
                  </li>
                ) : null}
                {bundle.insights.dominantType ? (
                  <li>
                    {bundle.insights.dominantType.name} 船型占船队 {formatPercent((bundle.insights.dominantType.count / shipTotal) * 100, 1)}，运力结构集中。
                  </li>
                ) : null}
                {bundle.insights.dominantAge ? (
                  <li>
                    {bundle.insights.dominantAge.name} 船龄段占比 {formatPercent((bundle.insights.dominantAge.count / ageTotal) * 100, 1)}，船龄分布呈明显中龄集中。
                  </li>
                ) : null}
              </ul>
            </article>
          </section>

          <section className="vibe-shipping-metric-grid">
            {topMetrics.map((metric) => (
              <article key={metric.key} className="vibe-shipping-card vibe-shipping-metric-card">
                <div className="vibe-shipping-metric-label">{metric.label}</div>
                <div className="vibe-shipping-metric-value vibe-shipping-mono">{formatMetric(metric.key, metric.value)}</div>
                <div className="vibe-shipping-metric-note">{metric.note}</div>
              </article>
            ))}
          </section>

          <section className="vibe-shipping-main-grid">
            <article className="vibe-shipping-card vibe-shipping-panel">
              <div className="vibe-shipping-panel-header">
                <div className="vibe-shipping-panel-title">运作天数趋势</div>
                <div className="vibe-shipping-panel-note">
                  {selectedShip === '全部'
                    ? '走势保持高位平稳，5 月至 12 月持续维持在年内高位区间。'
                    : `${selectedShip} 在当前时间窗口内的月度运作轨迹。`}
                </div>
              </div>
              <div className="vibe-shipping-chart-shell">
                <TrendChart rows={scopedTrendRows} />
              </div>
              <div className="vibe-shipping-trend-stats">
                <div className="vibe-shipping-trend-stat">
                  <div className="vibe-shipping-trend-label">峰值月份</div>
                  <div className="vibe-shipping-trend-value vibe-shipping-mono">
                    {topMonth ? `${topMonth.month} / ${formatNumber(topMonth.value, 1)}` : '-'}
                  </div>
                </div>
                <div className="vibe-shipping-trend-stat">
                  <div className="vibe-shipping-trend-label">低位月份</div>
                  <div className="vibe-shipping-trend-value vibe-shipping-mono">
                    {lowMonth ? `${lowMonth.month} / ${formatNumber(lowMonth.value, 1)}` : '-'}
                  </div>
                </div>
                <div className="vibe-shipping-trend-stat">
                  <div className="vibe-shipping-trend-label">同比增长</div>
                  <div className="vibe-shipping-trend-value vibe-shipping-mono">{formatPercent(yoyGrowth, 1)}</div>
                </div>
              </div>
            </article>

            <div className="vibe-shipping-side-stack">
              <article className="vibe-shipping-card vibe-shipping-panel">
                <div className="vibe-shipping-panel-header">
                  <div className="vibe-shipping-panel-title">头部船舶</div>
                  <div className="vibe-shipping-panel-note">
                    {selectedShip === '全部' ? '头部船舶全年保持满负荷附近运作。' : '当前已聚焦到单船视图。'}
                  </div>
                </div>
                <div className="vibe-shipping-rank-list">
                  {scopedRanking.map((item) => (
                    <div key={item.name} className="vibe-shipping-rank-row">
                      <div className="vibe-shipping-rank-head">
                        <div className="vibe-shipping-rank-name">{item.name}</div>
                        <div className="vibe-shipping-rank-value vibe-shipping-mono">
                          {formatNumber(item.days, 1)} 天 / 同比 {formatPercent(percentValue(item.yoy), 1)}
                        </div>
                      </div>
                      <div className="vibe-shipping-rank-track">
                        <div
                          className="vibe-shipping-rank-fill"
                          style={{ width: `${((item.days / Math.max(scopedRanking[0]?.days || 1, 1)) * 100).toFixed(2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="vibe-shipping-card vibe-shipping-panel">
            <div className="vibe-shipping-panel-header">
              <div className="vibe-shipping-panel-title">结构分布</div>
              <div className="vibe-shipping-panel-note">船型集中度高，船龄结构以中龄船为绝对主轴。</div>
            </div>
            <div className="vibe-shipping-structure-grid">
              <div className="vibe-shipping-type-table">
                {bundle.shipTypes.map((item) => (
                  <div key={item.name} className="vibe-shipping-type-row">
                    <div>
                      <div className="vibe-shipping-type-name">{item.name}</div>
                      <div className="vibe-shipping-panel-note">{formatNumber(item.teu || 0, 0)} TEU · {formatNumber(item.count, 0)} 艘</div>
                    </div>
                    <div className="vibe-shipping-type-track">
                      <div className="vibe-shipping-type-fill" style={{ width: `${((item.count / shipTotal) * 100).toFixed(2)}%` }} />
                    </div>
                    <div className="vibe-shipping-type-share vibe-shipping-mono">{formatPercent((item.count / shipTotal) * 100, 1)}</div>
                  </div>
                ))}
              </div>

              <div className="vibe-shipping-age-panel">
                <div className="vibe-shipping-age-total vibe-shipping-mono">{formatNumber(ageTotal, 0)}</div>
                <div className="vibe-shipping-age-caption">船龄分布</div>
                <div className="vibe-shipping-age-list">
                  {bundle.shipAges.map((item) => (
                    <div key={item.name} className="vibe-shipping-age-row">
                      <div className="vibe-shipping-age-row-top">
                        <div>{item.name}</div>
                        <div className="vibe-shipping-mono">{formatNumber(item.count, 0)} 艘 / {formatPercent((item.count / ageTotal) * 100, 1)}</div>
                      </div>
                      <div className="vibe-shipping-age-track">
                        <div className="vibe-shipping-age-fill" style={{ width: `${((item.count / ageTotal) * 100).toFixed(2)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="vibe-shipping-card vibe-shipping-detail-panel">
            <div className="vibe-shipping-panel-header">
              <div className="vibe-shipping-panel-title">船舶月运作明细</div>
              <div className="vibe-shipping-panel-note">深色月份表示更高利用率，可快速识别全年连续高位运行的船舶。</div>
            </div>
            <div className="vibe-shipping-detail-wrap">
              <table className="vibe-shipping-detail-table">
                <thead>
                  <tr>
                    <th>船舶</th>
                    {displayedMonthLabels.map((label: string) => (
                      <th key={label}>{label}</th>
                    ))}
                    <th>合计</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedDetailRows.map((row) => (
                    <tr key={row.ship}>
                      <td className="vibe-shipping-ship-cell">{row.ship}</td>
                      {row.months.map((value: number, index: number) => {
                        const ratio = Math.max(0, Math.min(1, value / heatMax));
                        const topAlpha = 0.12 + ratio * 0.78;
                        const bottomAlpha = 0.08 + ratio * 0.62;
                        return (
                          <td key={`${row.ship}-${displayedMonthLabels[index] || index}`}>
                            <div
                              className="vibe-shipping-heat"
                              style={{
                                background: `linear-gradient(180deg, rgba(26,127,167, ${topAlpha.toFixed(2)}), rgba(17,162,139, ${bottomAlpha.toFixed(2)}))`,
                                color: value > heatMax * 0.66 ? '#ffffff' : 'var(--ship-navy)',
                              }}
                            >
                              {formatNumber(value, value % 1 === 0 ? 0 : 1)}
                            </div>
                          </td>
                        );
                      })}
                      <td className="vibe-shipping-total-cell vibe-shipping-mono">{formatNumber(row.total, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function isDarkColor(color: string): boolean {
  const normalized = color.trim();
  const rgb = normalized.startsWith('#')
    ? hexToRgb(normalized)
    : rgbaStringToRgb(normalized);
  if (!rgb) {
    return false;
  }
  const luminance = (0.299 * rgb.r) + (0.587 * rgb.g) + (0.114 * rgb.b);
  return luminance < 160;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = color.replace('#', '').trim();
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }
  const fullHex = hex.length === 3
    ? hex.split('').map((part) => `${part}${part}`).join('')
    : hex;
  return {
    r: Number.parseInt(fullHex.slice(0, 2), 16),
    g: Number.parseInt(fullHex.slice(2, 4), 16),
    b: Number.parseInt(fullHex.slice(4, 6), 16),
  };
}

function rgbaStringToRgb(color: string): { r: number; g: number; b: number } | null {
  const match = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!match) {
    return null;
  }
  return {
    r: Number.parseInt(match[1], 10),
    g: Number.parseInt(match[2], 10),
    b: Number.parseInt(match[3], 10),
  };
}

function collectMetricMap(datasets: ShippingSourceDataset[]): Record<string, number> {
  const metricMap: Record<string, number> = {};

  datasets.forEach((dataset) => {
    if (dataset.rows.length === 0 || dataset.rows.length > 2) {
      return;
    }

    const valueField = dataset.analysis.numericFields.find((field) => !/(columnindex|rowindex|sortby)/i.test(field))
      || dataset.analysis.primaryValueField;

    if (!valueField) {
      return;
    }

    const key = canonicalMetricKey(valueField);
    if (!key) {
      return;
    }

    if (metricMap[key] != null) {
      return;
    }

    metricMap[key] = Number(dataset.rows[0][valueField] ?? 0);
  });

  return metricMap;
}

function selectTrendDataset(datasets: ShippingSourceDataset[]) {
  return datasets
    .filter((dataset) => dataset.rows.length > 0)
    .sort((left, right) => scoreTrendDataset(right) - scoreTrendDataset(left))[0];
}

function scoreTrendDataset(dataset: ShippingSourceDataset): number {
  const corpus = `${dataset.title} ${dataset.query?.name || ''} ${dataset.analysis.columns.join(' ')}`;
  let score = 0;
  if (dataset.analysis.timeFields.length > 0) {
    score += 40;
  }
  if (/年月|月份|month|trend|趋势/i.test(corpus)) {
    score += 30;
  }
  if (/月运作天数/.test(corpus)) {
    score += 30;
  }
  if (dataset.rows.length >= 6) {
    score += 18;
  }
  return score;
}

function selectTypeDataset(datasets: ShippingSourceDataset[]) {
  return datasets.find((dataset) => {
    const corpus = `${dataset.title} ${dataset.query?.name || ''} ${dataset.analysis.columns.join(' ')}`;
    return /船型|TEU船型/i.test(corpus);
  });
}

function selectAgeDataset(datasets: ShippingSourceDataset[]) {
  return datasets.find((dataset) => {
    const corpus = `${dataset.title} ${dataset.query?.name || ''} ${dataset.analysis.columns.join(' ')}`;
    return /船龄/i.test(corpus);
  });
}

function selectRankingDataset(datasets: ShippingSourceDataset[]) {
  return datasets
    .filter((dataset) => dataset.rows.length > 0)
    .sort((left, right) => scoreRankingDataset(right) - scoreRankingDataset(left))[0];
}

function scoreRankingDataset(dataset: ShippingSourceDataset): number {
  const corpus = `${dataset.title} ${dataset.query?.name || ''} ${dataset.analysis.columns.join(' ')}`;
  let score = 0;
  if (/船舶/.test(corpus)) {
    score += 30;
  }
  if (/运作天数/.test(corpus)) {
    score += 30;
  }
  if (dataset.analysis.categoricalFields.some((field) => /船舶/.test(field))) {
    score += 20;
  }
  if (dataset.analysis.numericFields.some((field) => /同比/.test(field))) {
    score += 10;
  }
  return score;
}

function selectDetailDataset(datasets: ShippingSourceDataset[]) {
  return datasets.find((dataset) => {
    const corpus = `${dataset.title} ${dataset.query?.name || ''} ${dataset.analysis.columns.join(' ')}`;
    return /明细|matrix|透视/i.test(corpus) || hasPivotShape(dataset.rows);
  });
}

function buildTrendRows(dataset?: ShippingSourceDataset): ShippingTrendRow[] {
  if (!dataset || dataset.rows.length === 0) {
    return [];
  }

  const monthNoField = dataset.analysis.columns.find((field) => /\[月\]$|月份序号|monthno|monthindex/i.test(field));
  const monthLabelField = dataset.analysis.columns.find((field) => /月份|month/i.test(field)) || dataset.analysis.primaryCategoryField;
  const valueField = dataset.analysis.columns.find((field) => /月运作天数_汇总(?!_同比)/.test(cleanFieldLabel(field)))
    || dataset.analysis.numericFields.find((field) => /月运作天数/.test(cleanFieldLabel(field)))
    || dataset.analysis.primaryValueField;
  const yoyField = dataset.analysis.columns.find((field) => /同比/.test(cleanFieldLabel(field)));
  const shipField = dataset.analysis.columns.find((field) => /船名|ships|DistinctCount船名/i.test(cleanFieldLabel(field)));

  if (!monthLabelField || !valueField) {
    return [];
  }

  return dataset.rows
    .map((row, index) => ({
      monthNo: Number(row[monthNoField || ''] ?? index + 1),
      month: String(row[monthLabelField] ?? `M${index + 1}`),
      value: Number(row[valueField] ?? 0),
      yoy: Number(row[yoyField || ''] ?? 0),
      ships: Number(row[shipField || ''] ?? 0),
    }))
    .sort((left, right) => left.monthNo - right.monthNo);
}

function buildTypeRows(dataset?: ShippingSourceDataset): ShippingAggregate[] {
  if (!dataset) {
    return [];
  }

  const nameField = dataset.analysis.columns.find((field) => /TEU船型|船型/i.test(cleanFieldLabel(field)))
    || dataset.analysis.primaryCategoryField;
  const countField = dataset.analysis.columns.find((field) => /船舶数量|count/i.test(cleanFieldLabel(field)))
    || dataset.analysis.primaryValueField;
  const teuField = dataset.analysis.columns.find((field) => /^TEU$|TEU\]/i.test(cleanFieldLabel(field)));

  if (!nameField || !countField) {
    return [];
  }

  return dataset.rows
    .map((row) => ({
      name: String(row[nameField] ?? '').trim(),
      count: Number(row[countField] ?? 0),
      teu: Number(row[teuField || ''] ?? 0),
    }))
    .filter((item) => item.name)
    .sort((left, right) => right.count - left.count || (right.teu || 0) - (left.teu || 0));
}

function buildAgeRows(dataset?: ShippingSourceDataset): ShippingAggregate[] {
  if (!dataset) {
    return [];
  }

  const nameField = dataset.analysis.columns.find((field) => /船龄/i.test(cleanFieldLabel(field)))
    || dataset.analysis.primaryCategoryField;
  const countField = dataset.analysis.columns.find((field) => /船舶数量|count/i.test(cleanFieldLabel(field)))
    || dataset.analysis.primaryValueField;

  if (!nameField || !countField) {
    return [];
  }

  return dataset.rows
    .map((row) => ({
      name: String(row[nameField] ?? '').trim(),
      count: Number(row[countField] ?? 0),
    }))
    .filter((item) => item.name)
    .sort((left, right) => right.count - left.count);
}

function buildRankingRows(dataset?: ShippingSourceDataset): ShippingRankingRow[] {
  if (!dataset) {
    return [];
  }

  const nameField = dataset.analysis.columns.find((field) => /船舶/.test(cleanFieldLabel(field)))
    || dataset.analysis.primaryCategoryField;
  const valueField = dataset.analysis.columns.find((field) => /月运作天数_汇总(?!_同比)/.test(cleanFieldLabel(field)))
    || dataset.analysis.primaryValueField;
  const yoyField = dataset.analysis.columns.find((field) => /同比/.test(cleanFieldLabel(field)));

  if (!nameField || !valueField) {
    return [];
  }

  return dataset.rows
    .map((row) => ({
      name: String(row[nameField] ?? '').trim(),
      days: Number(row[valueField] ?? 0),
      yoy: Number(row[yoyField || ''] ?? 0),
    }))
    .filter((item) => item.name)
    .sort((left, right) => right.days - left.days)
    .slice(0, 10);
}

function buildDetailRows(dataset: ShippingSourceDataset | undefined, monthCount: number): ShippingDetailRow[] {
  if (!dataset || dataset.rows.length === 0 || !hasPivotShape(dataset.rows)) {
    return [];
  }

  const shipField = dataset.analysis.columns.find((field) => /船舶/.test(cleanFieldLabel(field)));
  const valueField = dataset.analysis.columns.find((field) => /月运作天数_汇总(?!_同比)/.test(cleanFieldLabel(field)))
    || dataset.analysis.numericFields.find((field) => !/columnindex|sortby/i.test(field));
  const columnIndexField = dataset.analysis.columns.find((field) => /columnindex/i.test(field));
  const totalField = dataset.analysis.columns.find((field) => /SortBy_DM0_0/i.test(field));
  const grandRowField = dataset.analysis.columns.find((field) => /IsGrandTotalRowTotal/i.test(field));

  if (!shipField || !valueField || !columnIndexField) {
    return [];
  }

  const detailMap = new Map<string, ShippingDetailRow>();

  dataset.rows.forEach((row) => {
    if (row[grandRowField || '']) {
      return;
    }

    const ship = String(row[shipField] ?? '').trim();
    if (!ship) {
      return;
    }

    const entry = detailMap.get(ship) || {
      ship,
      months: Array.from({ length: monthCount }, () => 0),
      total: 0,
    };

    const columnIndex = Number(row[columnIndexField] ?? -1);
    const value = Number(row[valueField] ?? 0);
    if (columnIndex >= 0 && columnIndex < monthCount) {
      entry.months[columnIndex] = value;
    } else if (columnIndex === monthCount) {
      entry.total = value;
    }

    if (!entry.total) {
      entry.total = Number(row[totalField || ''] ?? 0);
    }

    detailMap.set(ship, entry);
  });

  return Array.from(detailMap.values())
    .map((row) => ({
      ...row,
      total: row.total || row.months.reduce((sum, value) => sum + value, 0),
    }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 10);
}

function buildMonthLabels(detailRows: ShippingDetailRow[]): string[] {
  const count = detailRows[0]?.months.length || 12;
  return Array.from({ length: count }, (_, index) => `${index + 1}月`);
}

function getMonthWindowIndices(mode: string, count: number): number[] {
  const all = Array.from({ length: count }, (_, index) => index);
  switch (mode) {
    case 'h1':
      return all.filter((index) => index < Math.ceil(count / 2));
    case 'h2':
      return all.filter((index) => index >= Math.ceil(count / 2));
    case 'q1':
      return all.filter((index) => index < 3);
    case 'q2':
      return all.filter((index) => index >= 3 && index < 6);
    case 'q3':
      return all.filter((index) => index >= 6 && index < 9);
    case 'q4':
      return all.filter((index) => index >= 9 && index < 12);
    default:
      return all;
  }
}

function canonicalMetricKey(field: string): string {
  const label = cleanFieldLabel(field).replace(/\./g, '_');
  const mapping = Object.keys(SHIPPING_METRIC_META)
    .sort((left, right) => right.length - left.length)
    .find((key) => label.includes(key));
  return mapping || label;
}

function normalizeReportTitle(name: string): string {
  return name.replace(/报告$/u, '').trim() || '运力运营分析';
}

function prettifyMetricLabel(key: string): string {
  return key.replaceAll('_', ' ');
}

function cleanFieldLabel(field: string): string {
  const bracketMatch = field.match(/\[([^\]]+)\]/);
  return (bracketMatch?.[1] || field).replace(/^Dim_\d+_/, '').trim();
}

function hasPivotShape(rows: DataRow[]): boolean {
  if (rows.length === 0) {
    return false;
  }

  const fields = Object.keys(rows[0]);
  return fields.some((field) => /columnindex|isgrandtotalrowtotal/i.test(field));
}

function percentValue(value: number | undefined): number {
  const numeric = Number(value ?? 0);
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

function formatMetric(key: string, value: number): string {
  if (key.includes('占比') || key.includes('增长') || key.includes('同比')) {
    return formatPercent(percentValue(value), 1);
  }
  if (key.includes('TEU')) {
    return formatNumber(value, 0);
  }
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

function formatPercent(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`;
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value ?? 0));
}

function TrendChart({ rows }: { rows: ShippingTrendRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  const width = 1040;
  const height = 360;
  const left = 62;
  const right = 24;
  const top = 20;
  const bottom = 56;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const min = Math.min(...rows.map((item) => item.value));
  const max = Math.max(...rows.map((item) => item.value));
  const range = Math.max(max - min, 1);
  const stepX = plotWidth / Math.max(1, rows.length - 1);
  const y = (value: number) => top + plotHeight - (((value - min) / range) * plotHeight);
  const points = rows.map((item, index) => [left + stepX * index, y(item.value)] as const);
  const polyline = points.map(([px, py]) => `${px},${py}`).join(' ');
  const area = `${left},${top + plotHeight} ${polyline} ${left + plotWidth},${top + plotHeight}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="ship-water-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(26,127,167,0.26)" />
          <stop offset="100%" stopColor="rgba(17,162,139,0.04)" />
        </linearGradient>
        <linearGradient id="ship-stroke-fill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--ship-cyan)" />
          <stop offset="100%" stopColor="var(--ship-teal)" />
        </linearGradient>
      </defs>
      {Array.from({ length: 4 }, (_, index) => {
        const lineY = top + (plotHeight / 3) * index;
        const value = max - (range / 3) * index;
        return (
          <g key={index}>
            <line x1={left} y1={lineY} x2={left + plotWidth} y2={lineY} stroke="rgba(18,57,90,0.08)" strokeDasharray="6 10" />
            <text x={left - 12} y={lineY + 4} textAnchor="end" fontSize="11" fill="var(--ship-muted)">
              {formatNumber(value, 0)}
            </text>
          </g>
        );
      })}
      <polygon points={area} fill="url(#ship-water-fill)" />
      <polyline
        points={polyline}
        fill="none"
        stroke="url(#ship-stroke-fill)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {rows.map((item, index) => {
        const [px, py] = points[index];
        return (
          <g key={item.month}>
            <circle cx={px} cy={py} r="5" fill="#ffffff" stroke="var(--ship-cyan)" strokeWidth="3" />
            <text x={px} y={top + plotHeight + 24} textAnchor="middle" fontSize="11" fill="var(--ship-muted)">
              {item.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
