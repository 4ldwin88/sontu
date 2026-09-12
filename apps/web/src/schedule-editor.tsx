import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button, TextField } from "../../../packages/ui-web";
import type { EventVersion } from "../../../packages/domain/coordination";
import { instantForWall, wallTime } from "../../../packages/domain/draft";
import { Modal } from "./shells";

export type ScheduleChange = {
  starts_at: string;
  ends_at: string;
  venue_label: string;
  confirmed: true;
};
export function ScheduleEditor({
  version,
  affected,
  busy,
  blocked,
  feedback,
  onSave,
  onClose,
}: {
  version: EventVersion;
  affected: number;
  busy: boolean;
  blocked: boolean;
  feedback: ReactNode;
  onSave: (change: ScheduleChange) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(
    wallTime(version.starts_at, version.timezone),
  );
  const [end, setEnd] = useState(wallTime(version.ends_at, version.timezone));
  const [venue, setVenue] = useState(version.venue_label);
  const [review, setReview] = useState<ScheduleChange | null>(null);
  const [issue, setIssue] = useState("");
  const display = (iso: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: version.timezone,
    }).format(new Date(iso));
  return (
    <Modal
      title={review ? "Review event changes" : "Edit schedule & location"}
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (review) {
            onSave(review);
            return;
          }
          const starts_at = instantForWall(start, version.timezone);
          const ends_at = instantForWall(end, version.timezone);
          if (!starts_at || !ends_at) {
            setIssue(
              "Choose valid, unambiguous times. Daylight-saving gaps and repeated times cannot be saved.",
            );
            return;
          }
          if (
            Date.parse(starts_at) <= Date.now() ||
            Date.parse(ends_at) <= Date.parse(starts_at)
          ) {
            setIssue("Choose a future start and an end after the start.");
            return;
          }
          if (!venue.trim()) {
            setIssue("Add a location.");
            return;
          }
          if (
            Date.parse(starts_at) === Date.parse(version.starts_at) &&
            Date.parse(ends_at) === Date.parse(version.ends_at) &&
            venue.trim() === version.venue_label
          ) {
            setIssue("Change the schedule or location before reviewing.");
            return;
          }
          setIssue("");
          setReview({
            starts_at,
            ends_at,
            venue_label: venue.trim(),
            confirmed: true,
          });
        }}
      >
        <p className="small muted">
          {version.title} · {version.timezone}. The event keeps its timezone
          when you travel.
        </p>
        {review ? (
          <>
            <dl className="schedule-review">
              {[
                [
                  "Starts",
                  display(version.starts_at),
                  display(review.starts_at),
                ],
                ["Ends", display(version.ends_at), display(review.ends_at)],
                ["Location", version.venue_label, review.venue_label],
              ].map(([name, before, after]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    {before === after ? (
                      after
                    ) : (
                      <>
                        <span className="muted">Previously: {before}</span>
                        <strong>Now: {after}</strong>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              {affected} currently committed{" "}
              {affected === 1 ? "guest" : "guests"} may be affected. Existing
              responses stay in history. You can review whether reconfirmation
              is needed; an existing reconfirmation obligation will carry
              forward to the changed details.
            </p>
            <p>
              Email delivery is not connected. Contact guests yourself; saving
              does not send an email or confirm their availability.
            </p>
          </>
        ) : (
          <>
            <TextField
              label="Start date and time"
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <TextField
              label="End date and time"
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
            <TextField
              label="Location"
              required
              maxLength={300}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </>
        )}
        {issue && <p role="alert">{issue}</p>}
        {feedback}
        <div className="coord-actions">
          <Button type="submit" disabled={busy || blocked}>
            {busy
              ? "Saving…"
              : review
                ? "Save event changes"
                : "Review changes"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || blocked}
            aria-label={review ? "Back to editing" : "Go back"}
            onClick={() => (review ? setReview(null) : onClose())}
          >
            <ChevronLeft size={26} strokeWidth={2.5} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
