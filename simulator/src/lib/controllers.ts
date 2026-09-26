// Registry of phone controllers so the scenario runner can drive a phone
// exactly like a person would (keypresses, visible typing, waiting for replies).

export interface ScreenSnapshot {
  mode: "home" | "loading" | "con" | "end" | "error";
  text: string;
}

export interface PhoneController {
  /** Close any session and return to the home screen */
  reset(): void;
  /** Type the code on the keypad and press call; resolves with the reply screen */
  dial(code: string): Promise<ScreenSnapshot>;
  /** Type into the input line and press Send; resolves with the reply screen */
  enter(value: string): Promise<ScreenSnapshot>;
  snapshot(): ScreenSnapshot;
}

export const controllers = new Map<string, PhoneController>();
