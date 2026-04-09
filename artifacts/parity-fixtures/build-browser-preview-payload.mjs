import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = new URL('./', import.meta.url);
const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(artifactDir, '..', '..');
const shippingDataPath = path.join(rootDir, 'artifacts', 'standalone-shipping-report-data.json');

const outputDir = path.join(artifactDir, 'generated');
await fs.mkdir(outputDir, { recursive: true });

const shippingData = JSON.parse(await fs.readFile(shippingDataPath, 'utf8'));

const fixtureFiles = [
  'shipping-parity-golden.json',
  'shipping-parity-degraded-generic-cards.json',
];

for (const fixtureFile of fixtureFiles) {
  const fixturePath = new URL(`./${fixtureFile}`, fixtureDir);
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  const payload = buildBrowserPreviewPayload(fixture, shippingData);
  const outputPath = path.join(outputDir, fixtureFile.replace(/\.json$/i, '.browser-preview.json'));
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(outputPath);
}

function buildBrowserPreviewPayload(fixture, shipping) {
  const reportId = slugify(`${fixture.reportName}-preview`);
  const pageId = `${reportId}-page`;
  const dataSource = {
    type: 'local',
    connection: {
      server: 'mock',
      database: 'parity-preview',
    },
  };

  const queries = [
    {
      id: 'shipping-q-hero-metric',
      name: 'Hero Metric',
      dax: 'EVALUATE ROW("月运作天数_汇总", [月运作天数_汇总])',
      executionDax: 'EVALUATE ROW("月运作天数_汇总", [月运作天数_汇总])',
      parameters: [],
    },
    {
      id: 'shipping-q-monthly-trend',
      name: 'Monthly Trend',
      dax: "EVALUATE SUMMARIZECOLUMNS('Dim_01_日期表'[月份], \"月运作天数_汇总\", [月运作天数_汇总])",
      executionDax: "EVALUATE SUMMARIZECOLUMNS('Dim_01_日期表'[月份], \"月运作天数_汇总\", [月运作天数_汇总])",
      parameters: [],
    },
    {
      id: 'shipping-q-ship-ranking',
      name: 'Ship Ranking',
      dax: "EVALUATE SUMMARIZECOLUMNS('Dim_02_船舶'[船舶], \"月运作天数_汇总\", [月运作天数_汇总])",
      executionDax: "EVALUATE SUMMARIZECOLUMNS('Dim_02_船舶'[船舶], \"月运作天数_汇总\", [月运作天数_汇总])",
      parameters: [],
    },
    {
      id: 'shipping-q-detail-table',
      name: 'Detail Table',
      dax: "EVALUATE SUMMARIZECOLUMNS('Dim_02_船舶'[船舶], 'Dim_01_日期表'[月份], \"月运作天数_汇总\", [月运作天数_汇总])",
      executionDax: "EVALUATE SUMMARIZECOLUMNS('Dim_02_船舶'[船舶], 'Dim_01_日期表'[月份], \"月运作天数_汇总\", [月运作天数_汇总])",
      parameters: [],
    },
  ];

  const prefetchedRowsByQuery = {
    'shipping-q-hero-metric': toQueryResult([
      {
        月运作天数_汇总: shipping.metricMap['月运作天数_汇总'],
        月运作天数_汇总_同比: shipping.metricMap['月运作天数_汇总_同比'],
        月运作天数_汇总_同比增长: shipping.metricMap['月运作天数_汇总_同比增长'],
      },
    ]),
    'shipping-q-monthly-trend': toQueryResult(
      (shipping.trendRows || []).map((row) => ({
        月份: row.month,
        月: row.monthNo,
        月运作天数_汇总: row.value,
        月运作天数_汇总_同比: row.yoy,
        DistinctCount船名: row.ships,
      })),
    ),
    'shipping-q-ship-ranking': toQueryResult(
      (shipping.shipRanking || []).map((row) => ({
        船名: row.name,
        月运作天数_汇总: row.days,
        月运作天数_汇总_同比: row.yoy,
      })),
    ),
    'shipping-q-detail-table': toQueryResult(
      (shipping.detailRows || []).flatMap((row) =>
        (row.months || []).map((value, index) => ({
          船名: row.ship,
          月份: `${index + 1}月`,
          月: index + 1,
          月运作天数_汇总: value,
        })),
      ),
    ),
  };

  return {
    report: {
      formatVersion: '1.0.0',
      id: reportId,
      name: fixture.reportName,
      description: fixture.reportDescription,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      generationMode: 'ai-generated',
      renderMode: 'creative-html',
      pages: [pageId],
      defaultPage: pageId,
      runtimeHints: fixture.runtimeHints,
      theme: fixture.theme,
    },
    pages: [
      {
        id: pageId,
        name: fixture.reportName,
        filters: [],
        components: [],
        html: fixture.html,
        css: fixture.css,
        js: fixture.js,
        bindings: fixture.bindings || [],
        viewport: fixture.viewport,
      },
    ],
    queries,
    theme: fixture.theme,
    dataSource,
    prefetchedRowsByQuery,
  };
}

function toQueryResult(rows) {
  const firstRow = rows[0] || {};
  const columns = Object.keys(firstRow).map((name) => ({
    name,
    dataType: inferColumnType(rows, name),
  }));
  return {
    columns,
    rows,
    rowCount: rows.length,
    executionTimeMs: 0,
  };
}

function inferColumnType(rows, columnName) {
  const sample = rows.find((row) => row?.[columnName] !== null && row?.[columnName] !== undefined)?.[columnName];
  if (typeof sample === 'number') {
    return 'number';
  }
  return 'string';
}

function slugify(value) {
  return String(value || 'parity-preview')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
