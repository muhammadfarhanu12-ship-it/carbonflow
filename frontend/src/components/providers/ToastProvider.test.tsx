import { act, render, screen } from "@testing-library/react";
import { ToastProvider } from "./ToastProvider";

describe("ToastProvider", () => {
  test("renders a session-expired toast on unauthorized event", async () => {
    render(
      <ToastProvider>
        <div>App</div>
      </ToastProvider>,
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent("carbonflow:unauthorized", {
        detail: {
          reason: "session_expired",
        },
      }));
    });

    expect(await screen.findByText("Session expired")).toBeInTheDocument();
    expect(screen.getByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
  });

  test("renders a server error toast on global api failure event", async () => {
    render(
      <ToastProvider>
        <div>App</div>
      </ToastProvider>,
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent("carbonflow:api-error", {
        detail: {
          statusCode: 500,
          message: "Backend returned a 500 error for /api/dashboard.",
        },
      }));
    });

    expect(await screen.findByText("Server error")).toBeInTheDocument();
    expect(screen.getByText("Backend returned a 500 error for /api/dashboard.")).toBeInTheDocument();
  });
});
