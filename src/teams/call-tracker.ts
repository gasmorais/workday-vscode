import { MIN_CALL_MINUTES } from "../constants.js";

export interface MeetingState {
  isInMeeting?: boolean;
  isMuted?: boolean;
  isVideoOn?: boolean;
  isSharing?: boolean;
  isRecordingOn?: boolean;
  isHandRaised?: boolean;
}

export interface CallSession {
  startedAt: number;
  endedAt: number;
  minutes: number;
  sharedScreen: boolean;
  spoke: boolean;
}

export class CallTracker {
  private startedAt: number | undefined;
  private sharedScreen = false;
  private spoke = false;

  get running(): boolean {
    return this.startedAt !== undefined;
  }

  get since(): number | undefined {
    return this.startedAt;
  }

  update(state: MeetingState, now: number): CallSession | undefined {
    if (state.isInMeeting) {
      if (this.startedAt === undefined) {
        this.startedAt = now;
        this.sharedScreen = false;
        this.spoke = false;
      }
      this.sharedScreen ||= Boolean(state.isSharing);
      this.spoke ||= state.isMuted === false;
      return undefined;
    }
    if (this.startedAt === undefined) {
      return undefined;
    }
    const startedAt = this.startedAt;
    this.startedAt = undefined;
    const minutes = Math.round((now - startedAt) / 60_000);
    if (minutes < MIN_CALL_MINUTES) {
      return undefined;
    }
    return {
      startedAt,
      endedAt: now,
      minutes,
      sharedScreen: this.sharedScreen,
      spoke: this.spoke,
    };
  }

  reset(): void {
    this.startedAt = undefined;
    this.sharedScreen = false;
    this.spoke = false;
  }
}

export function roundedHours(minutes: number, step = 5): string {
  const rounded = Math.max(step, Math.round(minutes / step) * step);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
