export type ShellIconName =
  | 'report-view'
  | 'data-view'
  | 'git'
  | 'import'
  | 'custom-dax'
  | 'query-builder'
  | 'sparkle'
  | 'visual-library'
  | 'refresh'
  | 'message'
  | 'chevron-left'
  | 'chevron-up'
  | 'chevron-down'
  | 'layout'
  | 'home'
  | 'model'
  | 'connect'
  | 'disconnect'
  | 'settings'
  | 'publish'
  | 'close'
  | 'check-circle'
  | 'pending-circle'
  | 'error-circle'
  | 'visibility-on'
  | 'visibility-off'
  | 'column'
  | 'measure'
  | 'filter'
  | 'add';

export function ShellIcon({
  name,
  size = 18,
  strokeWidth = 1.8,
}: {
  name: ShellIconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', overflow: 'visible' }}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {renderIcon(name)}
    </svg>
  );
}

function renderIcon(name: ShellIconName) {
  switch (name) {
    case 'report-view':
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M3.5 8.5H20.5" />
          <path d="M7 15L10 12L12.5 14.5L17 10" />
        </>
      );
    case 'data-view':
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M3.5 9H20.5" />
          <path d="M9 4.5V19.5" />
          <path d="M15 9V19.5" />
        </>
      );
    case 'git':
      return (
        <>
          <circle cx="7" cy="6.5" r="1.8" />
          <circle cx="17" cy="12" r="1.8" />
          <circle cx="7" cy="17.5" r="1.8" />
          <path d="M8.8 7.3L15.3 11" />
          <path d="M8.8 16.7L15.3 13" />
          <path d="M7 8.3V15.7" />
        </>
      );
    case 'import':
      return (
        <>
          <path d="M12 4.5V13.5" />
          <path d="M8.5 10L12 13.5L15.5 10" />
          <path d="M5 15.5V17C5 18.3807 6.11929 19.5 7.5 19.5H16.5C17.8807 19.5 19 18.3807 19 17V15.5" />
          <path d="M7 15.5H17" />
        </>
      );
    case 'custom-dax':
      return (
        <>
          <path d="M8.5 7L5 12L8.5 17" />
          <path d="M15.5 7L19 12L15.5 17" />
          <path d="M13 5L11 19" />
        </>
      );
    case 'query-builder':
      return (
        <>
          <circle cx="6.5" cy="7" r="2" />
          <circle cx="17.5" cy="7" r="2" />
          <circle cx="6.5" cy="17" r="2" />
          <circle cx="17.5" cy="17" r="2" />
          <path d="M8.5 7H15.5" />
          <path d="M6.5 9V15" />
          <path d="M17.5 9V15" />
          <path d="M8.5 17H15.5" />
        </>
      );
    case 'sparkle':
      return (
        <>
          <path d="M12 4L13.9 9.1L19 11L13.9 12.9L12 18L10.1 12.9L5 11L10.1 9.1L12 4Z" />
          <circle cx="18.5" cy="6" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case 'visual-library':
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M8 15V11" />
          <path d="M12 15V8.5" />
          <path d="M16 15V12.5" />
        </>
      );
    case 'refresh':
      return (
        <>
          <path d="M19 11.5A7 7 0 1 1 16.8 6.4" />
          <path d="M19 5V10H14" />
        </>
      );
    case 'message':
      return (
        <>
          <path d="M5 6.5C5 5.39543 5.89543 4.5 7 4.5H17C18.1046 4.5 19 5.39543 19 6.5V13.5C19 14.6046 18.1046 15.5 17 15.5H11.5L8 19V15.5H7C5.89543 15.5 5 14.6046 5 13.5V6.5Z" />
          <circle cx="9.5" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="10" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case 'chevron-left':
      return <path d="M14.5 7L9.5 12L14.5 17" />;
    case 'chevron-up':
      return <path d="M7 14.5L12 9.5L17 14.5" />;
    case 'chevron-down':
      return <path d="M7 9.5L12 14.5L17 9.5" />;
    case 'layout':
      return (
        <>
          <rect x="4.5" y="5" width="6.5" height="5.5" rx="1.2" />
          <rect x="13" y="5" width="6.5" height="5.5" rx="1.2" />
          <rect x="4.5" y="13.5" width="6.5" height="5.5" rx="1.2" />
          <rect x="13" y="13.5" width="6.5" height="5.5" rx="1.2" />
        </>
      );
    case 'home':
      return (
        <>
          <path d="M5 10.5L12 5L19 10.5" />
          <path d="M7.5 9.5V18.5H16.5V9.5" />
        </>
      );
    case 'model':
      return (
        <>
          <ellipse cx="12" cy="6.5" rx="7.5" ry="2.5" />
          <path d="M4.5 6.5V12C4.5 13.3807 7.85786 14.5 12 14.5C16.1421 14.5 19.5 13.3807 19.5 12V6.5" />
          <path d="M4.5 12V17.5C4.5 18.8807 7.85786 20 12 20C16.1421 20 19.5 18.8807 19.5 17.5V12" />
        </>
      );
    case 'connect':
      return (
        <>
          <path d="M9 4.5V8" />
          <path d="M15 4.5V8" />
          <path d="M8 11H16" />
          <path d="M12 11V17" />
          <path d="M10 17H14" />
          <path d="M7.5 8V11C7.5 13.4853 9.51472 15.5 12 15.5C14.4853 15.5 16.5 13.4853 16.5 11V8" />
        </>
      );
    case 'disconnect':
      return (
        <>
          <path d="M9 4.5V8" />
          <path d="M15 4.5V8" />
          <path d="M8 11H16" />
          <path d="M12 11V17" />
          <path d="M10 17H14" />
          <path d="M7.5 8V11C7.5 13.4853 9.51472 15.5 12 15.5C14.4853 15.5 16.5 13.4853 16.5 11V8" />
          <path d="M6 6L18 18" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4.5V6.5" />
          <path d="M12 17.5V19.5" />
          <path d="M4.5 12H6.5" />
          <path d="M17.5 12H19.5" />
          <path d="M6.7 6.7L8.1 8.1" />
          <path d="M15.9 15.9L17.3 17.3" />
          <path d="M17.3 6.7L15.9 8.1" />
          <path d="M8.1 15.9L6.7 17.3" />
        </>
      );
    case 'publish':
      return (
        <>
          <path d="M12 15.5V5.5" />
          <path d="M8.5 9L12 5.5L15.5 9" />
          <path d="M5 16.5V18C5 18.8284 5.67157 19.5 6.5 19.5H17.5C18.3284 19.5 19 18.8284 19 18V16.5" />
        </>
      );
    case 'close':
      return (
        <>
          <path d="M8 8L16 16" />
          <path d="M16 8L8 16" />
        </>
      );
    case 'check-circle':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 12.2L10.8 14.5L15.5 9.5" />
        </>
      );
    case 'pending-circle':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8V12L14.8 13.8" />
        </>
      );
    case 'error-circle':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M9.5 9.5L14.5 14.5" />
          <path d="M14.5 9.5L9.5 14.5" />
        </>
      );
    case 'visibility-on':
      return (
        <>
          <path d="M2.8 12C4.8 8.5 8.1 6.5 12 6.5C15.9 6.5 19.2 8.5 21.2 12C19.2 15.5 15.9 17.5 12 17.5C8.1 17.5 4.8 15.5 2.8 12Z" />
          <circle cx="12" cy="12" r="3.2" />
        </>
      );
    case 'visibility-off':
      return (
        <>
          <path d="M4.2 4.5L19.8 19.5" />
          <path d="M2.8 12C4.8 8.5 8.1 6.5 12 6.5C13.8 6.5 15.4 6.9 16.9 7.8" />
          <path d="M6.5 9C5.3 9.8 4.2 10.8 3.3 12C5.3 15.5 8.6 17.5 12.5 17.5C14 17.5 15.4 17.2 16.6 16.6" />
          <path d="M10.2 10.4C9.8 10.8 9.5 11.4 9.5 12C9.5 13.4 10.6 14.5 12 14.5C12.7 14.5 13.3 14.2 13.7 13.8" />
        </>
      );
    case 'column':
      return (
        <>
          <rect x="5" y="5" width="14" height="14" rx="2.5" />
          <path d="M9.5 5V19" />
          <path d="M14.5 5V19" />
        </>
      );
    case 'measure':
      return (
        <>
          <path d="M5 18.5L8.8 13.5L11.6 15.8L15.5 9.5L19 12.2" />
          <path d="M5 18.5H19" />
        </>
      );
    case 'filter':
      return (
        <>
          <path d="M4.5 6H19.5L14 12V18L10 16V12L4.5 6Z" />
        </>
      );
    case 'add':
      return (
        <>
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </>
      );
    default:
      return null;
  }
}
