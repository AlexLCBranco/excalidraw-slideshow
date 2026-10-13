import styles from "./ControlBar.module.css";
import { Icon, type IconName } from "./icons";
import type { Tool } from "./Slideshow";

/** What the mouse does on the page, as on excalidraw.com's toolbar. */
const TOOLS: [Tool, string][] = [
  ["hand", "Hand: drag to move around a zoomed page (V)"],
  ["select", "Select: drag a box over elements (V)"],
  ["laser", "Laser pointer (K)"],
  ["text", "Add text: click on the page and type (T)"],
];

interface Props {
  visible: boolean;
  index: number;
  count: number;
  pageName: string;
  fullscreen: boolean;
  tool: Tool;
  gridOpen: boolean;
  /** Part of a workbook's bottom strip, rather than floating. */
  docked?: boolean;
  /** Zoom relative to the fitted page (1 = whole page). */
  zoom: number;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGrid: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onTool: (tool: Tool) => void;
  onAddImage: () => void;
  onFullscreen: () => void;
  onHelp: () => void;
  onHover: (hovering: boolean) => void;
}

/** The floating bar at the bottom of the slideshow. It fades out while the mouse is still. */
export function ControlBar(p: Props) {
  return (
    <div
      className={styles.bar}
      data-visible={p.visible}
      data-docked={p.docked}
      // Keep focus off the buttons, so Space and Enter stay slideshow keys.
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => p.onHover(true)}
      onMouseLeave={() => p.onHover(false)}
    >
      <Button icon="back" label="Back (Esc)" onClick={p.onBack} />
      <span className={styles.divider} />
      <Button icon="previous" label="Previous page (←)" onClick={p.onPrevious} disabled={p.index === 0} />
      <button className={styles.counter} onClick={p.onGrid} title="All pages (G)">
        {p.pageName && <span className={styles.pageName}>{p.pageName}</span>}
        {p.index + 1} / {p.count}
      </button>
      <Button icon="next" label="Next page (→)" onClick={p.onNext} disabled={p.index === p.count - 1} />
      <span className={styles.divider} />
      <Button icon="zoomOut" label="Zoom out" onClick={p.onZoomOut} disabled={p.zoom <= 1} />
      <button className={styles.counter} onClick={p.onZoomReset} title="Whole page">
        {Math.round(p.zoom * 100)}%
      </button>
      <Button icon="zoomIn" label="Zoom in (drag to look around)" onClick={p.onZoomIn} />
      <span className={styles.divider} />
      <Button icon="grid" label="All pages (G)" onClick={p.onGrid} active={p.gridOpen} />
      <span className={styles.divider} />
      {TOOLS.map(([tool, label]) => (
        <Button key={tool} icon={tool} label={label} onClick={() => p.onTool(tool)} active={p.tool === tool} />
      ))}
      <Button icon="image" label="Add a picture (I, or paste one)" onClick={p.onAddImage} />
      <span className={styles.divider} />
      <Button
        icon={p.fullscreen ? "exitFullscreen" : "fullscreen"}
        label={p.fullscreen ? "Exit full screen (F)" : "Full screen (F)"}
        onClick={p.onFullscreen}
      />
      <Button icon="help" label="Shortcuts (?)" onClick={p.onHelp} />
    </div>
  );
}

function Button(props: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      className={styles.button}
      onClick={props.onClick}
      disabled={props.disabled}
      data-active={props.active ?? false}
      title={props.label}
      aria-label={props.label}
    >
      <Icon name={props.icon} />
    </button>
  );
}
