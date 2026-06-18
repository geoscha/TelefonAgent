/** Fired client-side after demo skip when UI should close and reset. */
export const SETUP_DEMO_SKIP_EVENT = "setup-demo:skipped";

export interface SetupDemoSkipDetail {
  resetUi: boolean;
}

export function dispatchSetupDemoSkipped(resetUi: boolean) {
  window.dispatchEvent(
    new CustomEvent<SetupDemoSkipDetail>(SETUP_DEMO_SKIP_EVENT, {
      detail: { resetUi },
    })
  );
}
