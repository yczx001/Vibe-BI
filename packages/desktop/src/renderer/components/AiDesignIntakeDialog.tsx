import React from 'react';
import { shellPalette } from './DesktopShell';

export type AiDesignStylePreset = 'boardroom-editorial' | 'harbor-ledger' | 'midnight-industrial' | 'atlas-feature';
export type AiDesignColorMode = 'light' | 'dark' | 'auto';
export type AiDesignFocus = 'hero-metric' | 'trend-story' | 'ranking-comparison' | 'detail-ledger';
export type AiDesignDensity = 'airy' | 'balanced' | 'dense';
export type AiDesignFilterPlacement = 'top' | 'left' | 'right';
export type AiDesignInteractionLevel = 'subtle' | 'standard' | 'rich';

export interface AiDesignIntakeDraft {
  stylePreset: AiDesignStylePreset;
  colorMode: AiDesignColorMode;
  focus: AiDesignFocus;
  density: AiDesignDensity;
  filterPlacement: AiDesignFilterPlacement;
  interactionLevel: AiDesignInteractionLevel;
  notes: string;
}

export interface AiDesignIntakeDialogProps {
  open: boolean;
  draft: AiDesignIntakeDraft;
  onChange: (draft: AiDesignIntakeDraft) => void;
  onClose: () => void;
  onConfirm: () => void;
  isRunning?: boolean;
}

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${shellPalette.border}`,
  background: '#FFFFFF',
  padding: '12px 14px',
  display: 'grid',
  gap: 8,
};

const stylePresetOptions: Array<{ value: AiDesignStylePreset; label: string; description: string }> = [
  { value: 'boardroom-editorial', label: 'Boardroom Editorial', description: '偏经营汇报，主副层级清晰，适合高层审阅。' },
  { value: 'harbor-ledger', label: 'Harbor Ledger', description: '更像运营台账，强调细节、节奏和数据密度。' },
  { value: 'midnight-industrial', label: 'Midnight Industrial', description: '深色工业风，强调沉稳、强对比和夜间控制台感。' },
  { value: 'atlas-feature', label: 'Atlas Feature', description: '更像专题页，适合讲故事和做对比叙事。' },
];

const colorModeOptions: Array<{ value: AiDesignColorMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '自动' },
];

const focusOptions: Array<{ value: AiDesignFocus; label: string }> = [
  { value: 'hero-metric', label: '重点指标优先' },
  { value: 'trend-story', label: '趋势叙事优先' },
  { value: 'ranking-comparison', label: '排行对比优先' },
  { value: 'detail-ledger', label: '明细台账优先' },
];

const densityOptions: Array<{ value: AiDesignDensity; label: string }> = [
  { value: 'airy', label: '留白更大' },
  { value: 'balanced', label: '平衡' },
  { value: 'dense', label: '信息更密' },
];

const filterPlacementOptions: Array<{ value: AiDesignFilterPlacement; label: string }> = [
  { value: 'top', label: '顶部' },
  { value: 'left', label: '左侧' },
  { value: 'right', label: '右侧' },
];

const interactionOptions: Array<{ value: AiDesignInteractionLevel; label: string }> = [
  { value: 'subtle', label: '克制' },
  { value: 'standard', label: '标准' },
  { value: 'rich', label: '更丰富' },
];

export function AiDesignIntakeDialog({
  open,
  draft,
  onChange,
  onClose,
  onConfirm,
  isRunning = false,
}: AiDesignIntakeDialogProps) {
  if (!open) {
    return null;
  }

  const setField = <K extends keyof AiDesignIntakeDraft>(key: K, value: AiDesignIntakeDraft[K]) => {
    onChange({
      ...draft,
      [key]: value,
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(880px, 100%)',
          maxHeight: '84vh',
          overflow: 'auto',
          borderRadius: 22,
          border: `1px solid ${shellPalette.border}`,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          boxShadow: '0 28px 60px rgba(15, 23, 42, 0.16)',
          padding: 22,
          display: 'grid',
          gap: 16,
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: shellPalette.text }}>生成前确认风格</div>
          <div style={{ fontSize: 12, lineHeight: 1.75, color: shellPalette.textMuted }}>
            先确认主题、色调、重点和信息密度，再由 AI 按 front-end design 引导生成首版报表。这样你可以先看不同方向，再决定要不要继续微调。
          </div>
        </div>

        <div style={{ ...CARD_STYLE, gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: shellPalette.text }}>主题风格</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {stylePresetOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setField('stylePreset', option.value)}
                style={{
                  textAlign: 'left',
                  borderRadius: 14,
                  border: draft.stylePreset === option.value ? `1px solid ${shellPalette.accent}` : `1px solid ${shellPalette.border}`,
                  background: draft.stylePreset === option.value ? shellPalette.accentSoft : '#FFFFFF',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: shellPalette.text }}>{option.label}</span>
                <span style={{ fontSize: 11, lineHeight: 1.6, color: shellPalette.textMuted }}>{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <ChoiceGroup
            title="色调"
            value={draft.colorMode}
            options={colorModeOptions}
            onChange={(value) => setField('colorMode', value as AiDesignColorMode)}
          />
          <ChoiceGroup
            title="页面重点"
            value={draft.focus}
            options={focusOptions}
            onChange={(value) => setField('focus', value as AiDesignFocus)}
          />
          <ChoiceGroup
            title="信息密度"
            value={draft.density}
            options={densityOptions}
            onChange={(value) => setField('density', value as AiDesignDensity)}
          />
          <ChoiceGroup
            title="筛选位置"
            value={draft.filterPlacement}
            options={filterPlacementOptions}
            onChange={(value) => setField('filterPlacement', value as AiDesignFilterPlacement)}
          />
        </div>

        <ChoiceGroup
          title="交互强度"
          value={draft.interactionLevel}
          options={interactionOptions}
          onChange={(value) => setField('interactionLevel', value as AiDesignInteractionLevel)}
        />

        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 700, color: shellPalette.text }}>补充要求</div>
          <textarea
            value={draft.notes}
            onChange={(event) => setField('notes', event.target.value)}
            placeholder="例如：想先看浅色 boardroom 风，再决定要不要改成深色；或“希望明细区更强，趋势区更克制”。"
            style={{
              width: '100%',
              minHeight: 92,
              resize: 'vertical',
              borderRadius: 12,
              border: `1px solid ${shellPalette.border}`,
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.7,
              color: shellPalette.text,
              background: '#FFFFFF',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: `1px solid ${shellPalette.border}`,
              background: '#FFFFFF',
              color: shellPalette.textMuted,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRunning}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: isRunning
                ? 'linear-gradient(135deg, #CBD5E1 0%, #94A3B8 100%)'
                : 'linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #EA580C 100%)',
              color: '#FFFFFF',
              fontWeight: 800,
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {isRunning ? '生成中...' : '确认并生成'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceGroup({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ fontSize: 13, fontWeight: 700, color: shellPalette.text }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: value === option.value ? `1px solid ${shellPalette.accent}` : `1px solid ${shellPalette.border}`,
              background: value === option.value ? shellPalette.accentSoft : '#FFFFFF',
              color: value === option.value ? shellPalette.accent : shellPalette.textMuted,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
