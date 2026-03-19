interface Props {
  fileName: string;
  onOpenFile: () => void;
}

export default function Titlebar({ fileName, onOpenFile }: Props) {
  return (
    <div id="titlebar">
      <span className="app-name">MBOX//</span>
      <span className="file-name">{fileName}</span>
      <div className="spacer"></div>
      <button id="open-btn" onClick={onOpenFile}>📂 mboxを開く</button>
    </div>
  );
}
