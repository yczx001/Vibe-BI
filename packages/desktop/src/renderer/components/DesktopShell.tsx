import React, { type ReactNode } from 'react';

export const shellPalette = {
  appBg: '#F7F4EE',
  ribbonBg: '#FFFDF7',
  ribbonMutedBg: '#F5F7FB',
  paneBg: '#FFFDFC',
  paneAltBg: '#F1F5FB',
  workspaceBg: '#EEF2F7',
  canvasBg: '#FFFFFF',
  border: '#D9D4CA',
  borderStrong: '#CBD4E1',
  text: '#1F2329',
  textMuted: '#626872',
  textSubtle: '#8A909C',
  accent: '#0F8C72',
  accentSoft: '#E1F4ED',
  accentBorder: '#7BC7B2',
  success: '#16824F',
  successSoft: '#E3F4EA',
  warning: '#B86818',
  warningSoft: '#FFF0DD',
  error: '#B42335',
  errorSoft: '#FCE7EB',
  shadow: '0 10px 24px rgba(31, 41, 55, 0.08)',
};

interface HeaderStatusProps {
  label: string;
  tone?: 'default' | 'success' | 'accent' | 'warning';
}

export function AppTitleBar({
  title,
  subtitle,
  status,
}: {
  title: string;
  subtitle?: string;
  status?: HeaderStatusProps;
}) {
  const statusStyles = getStatusStyles(status?.tone || 'default');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 18px 10px',
        background: shellPalette.ribbonBg,
        borderBottom: `1px solid ${shellPalette.border}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ color: shellPalette.text, fontSize: 18, fontWeight: 600 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ color: shellPalette.textMuted, fontSize: 12 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {status ? (
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            ...statusStyles,
          }}
        >
          {status.label}
        </div>
      ) : null}
    </div>
  );
}

export function RibbonTabs<T extends string>({
  items,
  activeId,
  onChange,
}: {
  items: Array<{ id: T; label: string; color?: string }>;
  activeId: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '0 14px',
        background: 'linear-gradient(180deg, #FFFDF8 0%, #F7F8FB 100%)',
        borderBottom: `1px solid ${shellPalette.border}`,
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              position: 'relative',
              padding: '11px 16px 10px',
              border: 'none',
              borderBottom: isActive ? `2px solid ${item.color || shellPalette.accent}` : '2px solid transparent',
              borderRadius: '10px 10px 0 0',
              background: isActive ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,248,255,0.96) 100%)' : 'transparent',
              color: isActive ? shellPalette.text : shellPalette.textMuted,
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              boxShadow: isActive ? '0 8px 18px rgba(15, 23, 42, 0.06)' : 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: 14,
                right: 14,
                height: 3,
                borderRadius: 999,
                background: isActive ? (item.color || shellPalette.accent) : 'transparent',
                opacity: 0.95,
              }}
            />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function RibbonBar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 12,
        padding: '10px 14px 12px',
        minHeight: 108,
        background: 'linear-gradient(180deg, #FFFDF8 0%, #F4F7FB 100%)',
        borderBottom: `1px solid ${shellPalette.borderStrong}`,
        overflowX: 'auto',
        boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.8)',
      }}
    >
      {children}
    </div>
  );
}

export function RibbonGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minWidth: 180,
        paddingRight: 12,
        borderRight: `1px solid ${shellPalette.border}`,
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignContent: 'flex-start' }}>
        {children}
      </div>
      <div
        style={{
          marginTop: 10,
          color: shellPalette.textSubtle,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3,
          textAlign: 'center',
          width: '100%',
        }}
      >
        {title}
      </div>
    </div>
  );
}

export function CommandButton({
  label,
  description,
  icon,
  onClick,
  disabled = false,
  active = false,
  tone = 'default',
  showDescription = true,
}: {
  label: string;
  description?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'default' | 'accent';
  showDescription?: boolean;
}) {
  const isCompact = !showDescription;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={description ? `${label} · ${description}` : label}
      style={{
        width: isCompact ? 104 : 112,
        minHeight: isCompact ? 86 : 66,
        padding: isCompact ? '12px 10px 10px' : '10px 12px',
        borderRadius: 14,
        border: `1px solid ${active || tone === 'accent' ? shellPalette.accentBorder : '#E3E7EF'}`,
        background: active || tone === 'accent'
          ? 'linear-gradient(180deg, #FFFFFF 0%, #E8F7F2 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%)',
        color: disabled ? shellPalette.textSubtle : shellPalette.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isCompact ? 'center' : 'flex-start',
        justifyContent: isCompact ? 'center' : 'space-between',
        textAlign: isCompact ? 'center' : 'left',
        gap: isCompact ? 8 : 0,
        boxShadow: active ? shellPalette.shadow : '0 4px 12px rgba(15, 23, 42, 0.05)',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {icon ? (
        <span
          aria-hidden="true"
          style={{
            width: isCompact ? 38 : 28,
            height: isCompact ? 38 : 28,
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(255,255,255,0.72)',
            color: active || tone === 'accent' ? shellPalette.accent : shellPalette.textMuted,
            fontSize: isCompact ? 18 : 14,
            fontWeight: 700,
            boxShadow: '0 6px 14px rgba(15, 23, 42, 0.08)',
          }}
        >
          {icon}
        </span>
      ) : null}
      <span style={{ width: '100%', fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>
        {label}
      </span>
      {showDescription && description ? (
        <span style={{ fontSize: 10, lineHeight: 1.35, color: shellPalette.textMuted }}>
          {description}
        </span>
      ) : null}
    </button>
  );
}

export function WorkspaceLayout({
  leftPane,
  center,
  rightPane,
  leftWidth = '332px',
  rightWidth = '340px',
}: {
  leftPane?: ReactNode;
  center: ReactNode;
  rightPane?: ReactNode;
  leftWidth?: string;
  rightWidth?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `${leftPane ? `${leftWidth} ` : ''}minmax(0, 1fr)${rightPane ? ` ${rightWidth}` : ''}`,
        background: shellPalette.workspaceBg,
      }}
    >
      {leftPane}
      {center}
      {rightPane}
    </div>
  );
}

export function SideRail<T extends string>({
  items,
  activeId,
  onChange,
}: {
  items: Array<{ id: T; label: string; icon: ReactNode }>;
  activeId: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      style={{
        width: 52,
        padding: '12px 0',
        borderRight: `1px solid ${shellPalette.border}`,
        background: 'linear-gradient(180deg, #FFFDF8 0%, #F4F7FB 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <div
            key={item.id}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 4,
                height: 30,
                borderRadius: '0 4px 4px 0',
                background: isActive ? 'linear-gradient(180deg, #2BC48A 0%, #3B82F6 100%)' : 'transparent',
              }}
            />
            <button
              type="button"
              title={item.label}
              onClick={() => onChange(item.id)}
              style={{
                width: 40,
                height: 40,
                marginLeft: 4,
                borderRadius: 12,
                border: `1px solid ${isActive ? shellPalette.accentBorder : 'rgba(255,255,255,0.2)'}`,
                background: isActive ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(232,247,242,0.98) 100%)' : 'transparent',
                color: isActive ? shellPalette.accent : shellPalette.textMuted,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isActive ? '0 8px 18px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              {item.icon}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PaneSurface({
  title,
  subtitle,
  children,
  borderSide = 'right',
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  borderSide?: 'left' | 'right' | 'none';
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #FFFEFB 0%, #FAFCFF 100%)',
        borderRight: borderSide === 'right' ? `1px solid ${shellPalette.border}` : 'none',
        borderLeft: borderSide === 'left' ? `1px solid ${shellPalette.border}` : 'none',
      }}
    >
      <div
        style={{
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${shellPalette.border}`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: shellPalette.text, fontSize: 15, fontWeight: 600 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ color: shellPalette.textMuted, fontSize: 11, marginTop: 4 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {actions}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

export function RightPaneSurface({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #FFFDFC 0%, #F9FBFE 100%)',
        borderLeft: `1px solid ${shellPalette.border}`,
      }}
    >
      {children}
    </div>
  );
}

export function PaneTabs<T extends string>({
  items,
  activeId,
  onChange,
}: {
  items: Array<{ id: T; label: string; color?: string }>;
  activeId: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        padding: '10px 10px 0',
        borderBottom: `1px solid ${shellPalette.border}`,
        background: 'linear-gradient(180deg, #F9FBFE 0%, #F2F6FC 100%)',
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: 'none',
              borderBottom: isActive ? `2px solid ${item.color || shellPalette.accent}` : '2px solid transparent',
              borderRadius: '10px 10px 0 0',
              background: isActive ? 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFE 100%)' : 'transparent',
              color: isActive ? shellPalette.text : shellPalette.textMuted,
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              boxShadow: isActive ? '0 8px 18px rgba(15, 23, 42, 0.06)' : 'none',
            }}
          >
            {item.color ? (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  marginRight: 8,
                  borderRadius: 999,
                  background: item.color,
                }}
              />
            ) : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function PaneCard({
  title,
  subtitle,
  actions,
  children,
  tone = 'default',
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning';
}) {
  const styles = getCardToneStyles(tone);

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${styles.border}`,
        background: styles.background,
        boxShadow: tone === 'default' ? shellPalette.shadow : '0 8px 20px rgba(15, 23, 42, 0.05)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          borderBottom: `1px solid ${styles.headerBorder}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: shellPalette.text, fontSize: 13, fontWeight: 600 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ color: shellPalette.textMuted, fontSize: 11, marginTop: 4 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {actions}
      </div>
      <div style={{ padding: 14 }}>
        {children}
      </div>
    </div>
  );
}

export function InfoPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'accent' | 'warning';
}) {
  const styles = getStatusStyles(tone);

  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        ...styles,
      }}
    >
      {label}: {value}
    </div>
  );
}

export function WorkspaceHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '16px 20px 14px',
        borderBottom: `1px solid ${shellPalette.border}`,
        background: 'linear-gradient(180deg, #FFFDFC 0%, #FBFCFE 100%)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: shellPalette.text, fontSize: 18, fontWeight: 600 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ color: shellPalette.textMuted, fontSize: 12, marginTop: 4 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function WorkspaceWelcome({
  onConnect,
  onImport,
  onGenerate,
  onOpenAi,
  isConnected,
  hasImportedVisuals,
  canGenerate,
  canOpenAi,
}: {
  onConnect: () => void;
  onImport: () => void;
  onGenerate: () => void;
  onOpenAi: () => void;
  isConnected: boolean;
  hasImportedVisuals: boolean;
  canGenerate: boolean;
  canOpenAi: boolean;
}) {
  const steps = [
    {
      badge: '01',
      icon: '◎',
      title: '连接数据源',
      subtitle: isConnected
        ? '已连接，可继续导入。'
        : '先连接模型。',
      actionLabel: isConnected ? '已完成' : '连接',
      onClick: onConnect,
      completed: isConnected,
      enabled: true,
      accent: '#0F8C72',
    },
    {
      badge: '02',
      icon: '↓',
      title: '导入 JSON',
      subtitle: hasImportedVisuals
        ? '已导入，可检查 visual。'
        : '导入 Performance Analyzer JSON。',
      actionLabel: hasImportedVisuals ? '已完成' : '导入',
      onClick: onImport,
      completed: hasImportedVisuals,
      enabled: isConnected,
      accent: '#2563EB',
    },
    {
      badge: '03',
      icon: '✦',
      title: 'AI 生成',
      subtitle: canGenerate
        ? '可生成报表。'
        : '完成前两步后可用。',
      actionLabel: canOpenAi ? '已完成' : '生成',
      onClick: onGenerate,
      completed: canOpenAi,
      enabled: canGenerate,
      accent: '#7C3AED',
    },
    {
      badge: '04',
      icon: '⋯',
      title: 'AI 助手',
      subtitle: canOpenAi
        ? '可继续对话调整。'
        : '生成报表后可用。',
      actionLabel: '打开',
      onClick: onOpenAi,
      completed: false,
      enabled: canOpenAi,
      accent: '#D97706',
    },
  ] as const;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: 32,
        background: `
          radial-gradient(circle at top left, rgba(43, 196, 138, 0.12), transparent 26%),
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 28%),
          linear-gradient(180deg, #EEF2F7 0%, #F7F8FC 100%)
        `,
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            borderRadius: 28,
            border: `1px solid ${shellPalette.border}`,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(249,251,254,0.96) 100%)',
            boxShadow: '0 20px 48px rgba(15, 23, 42, 0.08)',
            padding: '34px 34px 30px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 14px',
                borderRadius: 999,
                background: 'linear-gradient(90deg, rgba(43,196,138,0.16) 0%, rgba(59,130,246,0.16) 100%)',
                color: shellPalette.text,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
              }}
            >
              VIBE BI WORKFLOW
            </div>
            <div style={{ marginTop: 16, color: shellPalette.text, fontSize: 32, fontWeight: 700 }}>
              四步完成导入、分析与生成
            </div>
            <div style={{ marginTop: 10, color: shellPalette.textMuted, fontSize: 14, lineHeight: 1.7 }}>
              先连接，再导入，然后生成并继续调整。
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 16,
              alignItems: 'stretch',
            }}
          >
            {steps.map((step) => (
              <div
                key={step.badge}
                style={{
                  position: 'relative',
                  borderRadius: 22,
                  border: `1px solid ${step.completed ? `${step.accent}55` : `${step.accent}26`}`,
                  background: step.completed
                    ? `linear-gradient(180deg, rgba(255,255,255,0.99) 0%, ${step.accent}18 100%)`
                    : `linear-gradient(180deg, rgba(255,255,255,0.97) 0%, ${step.accent}08 100%)`,
                  padding: '20px 18px 18px',
                  boxShadow: step.completed ? '0 16px 30px rgba(15, 23, 42, 0.09)' : '0 10px 20px rgba(15, 23, 42, 0.05)',
                  zIndex: 1,
                  opacity: step.enabled ? 1 : 0.78,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: step.completed ? `${step.accent}18` : `${step.accent}10`,
                    color: step.completed ? step.accent : (step.enabled ? `${step.accent}CC` : shellPalette.textSubtle),
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  {step.badge}
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: step.completed
                      ? `linear-gradient(135deg, ${step.accent} 0%, ${step.accent}CC 100%)`
                      : `linear-gradient(180deg, ${step.accent}12 0%, ${step.accent}1E 100%)`,
                    border: step.completed ? 'none' : `1px solid ${step.accent}26`,
                    color: step.completed ? '#FFFFFF' : (step.enabled ? step.accent : shellPalette.textMuted),
                    fontSize: 22,
                    fontWeight: 800,
                    boxShadow: step.completed ? '0 14px 24px rgba(15, 23, 42, 0.14)' : '0 8px 18px rgba(15, 23, 42, 0.06)',
                  }}
                >
                  {step.icon}
                </div>
                <div style={{ marginTop: 18, color: shellPalette.text, fontSize: 18, fontWeight: 700 }}>
                  {step.title}
                </div>
                <div style={{ marginTop: 10, minHeight: 66, color: shellPalette.textMuted, fontSize: 12, lineHeight: 1.7 }}>
                  {step.subtitle}
                </div>
                <button
                  type="button"
                  onClick={step.onClick}
                  disabled={!step.enabled}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 14,
                    border: step.completed ? 'none' : `1px solid ${step.accent}2E`,
                    background: step.completed
                      ? `linear-gradient(135deg, ${step.accent} 0%, ${step.accent}CC 100%)`
                      : `linear-gradient(180deg, #FFFFFF 0%, ${step.accent}0D 100%)`,
                    color: step.completed ? '#FFFFFF' : (step.enabled ? step.accent : shellPalette.textMuted),
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: step.enabled ? 'pointer' : 'not-allowed',
                    opacity: step.enabled ? 1 : 0.62,
                    boxShadow: step.completed ? '0 10px 18px rgba(15, 23, 42, 0.12)' : 'none',
                  }}
                >
                  {step.completed ? '已完成' : step.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusStyles(tone: 'default' | 'success' | 'accent' | 'warning') {
  switch (tone) {
    case 'success':
      return {
        background: shellPalette.successSoft,
        color: shellPalette.success,
      };
    case 'accent':
      return {
        background: shellPalette.accentSoft,
        color: shellPalette.accent,
      };
    case 'warning':
      return {
        background: shellPalette.warningSoft,
        color: shellPalette.warning,
      };
    case 'default':
    default:
      return {
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%)',
        color: shellPalette.textMuted,
      };
  }
}

function getCardToneStyles(tone: 'default' | 'accent' | 'success' | 'warning') {
  switch (tone) {
    case 'accent':
      return {
        background: 'linear-gradient(180deg, #FCFEFF 0%, #EFF8FF 100%)',
        border: shellPalette.accentBorder,
        headerBorder: '#D6EAF8',
      };
    case 'success':
      return {
        background: 'linear-gradient(180deg, #F8FFFB 0%, #E7F7EE 100%)',
        border: '#B7DFB6',
        headerBorder: '#CDE9CD',
      };
    case 'warning':
      return {
        background: 'linear-gradient(180deg, #FFF9F0 0%, #FFF0DD 100%)',
        border: '#F1D17A',
        headerBorder: '#F7E2A1',
      };
    case 'default':
    default:
      return {
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FBFCFE 100%)',
        border: shellPalette.border,
        headerBorder: shellPalette.border,
      };
  }
}
