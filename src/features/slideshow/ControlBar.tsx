import styles from "./ControlBar.module.css";
import { Icon, type IconName } from "./icons";

interface Props {
  visible: boolean;
  index: number;
  count: number;
  pageName: string;
  fullscreen: boolean;
  laser: boolean;
  gridOpen: boolean;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGrid: () => void;
  onLaser: () => void;
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
      <Button icon="grid" label="All pages (G)" onClick={p.onGrid} active={p.gridOpen} />
      <Button icon="laser" label="Laser pointer (K)" onClick={p.onLaser} active={p.laser} />
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
