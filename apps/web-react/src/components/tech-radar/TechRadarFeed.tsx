import type { TechRadarEntry } from "./types";
import { TechRadarTimelineEntry } from "./TechRadarTimelineEntry";

export function TechRadarFeed({
  entries,
  selectedId,
  onSelect,
  onOpenBriefing
}: {
  entries: TechRadarEntry[];
  selectedId: string | null;
  onSelect: (entry: TechRadarEntry) => void;
  onOpenBriefing: (sessionId: string) => void;
}) {
  if (!entries.length) {
    return <p className="result-text tech-radar-empty">—</p>;
  }

  return (
    <ol className="report-timeline-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <TechRadarTimelineEntry
            entry={entry}
            selected={selectedId === entry.id}
            onSelect={onSelect}
            onOpenBriefing={onOpenBriefing}
          />
        </li>
      ))}
    </ol>
  );
}
