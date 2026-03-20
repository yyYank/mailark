interface Props {
  fileName: string;
  onOpenFile: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function Titlebar({ fileName, onOpenFile, theme, onToggleTheme }: Props) {
  return (
    <div id="titlebar">
      <span className="app-name">mailark</span>
      <span className="file-name">{fileName}</span>
      <div className="spacer"></div>
      <button id="theme-btn" onClick={onToggleTheme}>
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>
      <button id="open-btn" onClick={onOpenFile}>📂 ファイルを開く</button>
    </div>
  );
}
