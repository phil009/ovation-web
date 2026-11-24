import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ErrorSummary } from "./error-summary";
import { TextField } from "./field";
import { PasswordField } from "./password-field";

describe("TextField", () => {
  it("has a visible label, and announces required, hint and error", () => {
    render(
      <TextField
        id="email"
        label="Email address"
        hint="We never share it."
        error="Enter an email."
        required
      />,
    );
    const input = screen.getByLabelText(/Email address/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Error: Enter an email. We never share it.");
    expect(screen.getByText("(required)")).toBeVisible();
  });

  it("is not marked invalid without an error", () => {
    render(<TextField id="name" label="Your name" />);
    const input = screen.getByLabelText("Your name");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("never blocks paste", async () => {
    render(<TextField id="code" label="Invite code" />);
    const input = screen.getByLabelText("Invite code");
    input.focus();
    await userEvent.paste("OVN-7K2P-QX9M");
    expect(input).toHaveValue("OVN-7K2P-QX9M");
  });
});

describe("PasswordField", () => {
  it("toggles visibility with a real button that reports aria-pressed", async () => {
    render(<PasswordField id="pw" label="Password" autoComplete="current-password" />);
    const input = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(input).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("ErrorSummary", () => {
  it("takes focus, is announced, and links each error to its field", async () => {
    render(
      <>
        <ErrorSummary
          focusKey={1}
          items={[
            { fieldId: "email", message: "Enter your email address." },
            { message: "Server problem." },
          ]}
        />
        <TextField id="email" label="Email address" />
      </>,
    );
    const summary = screen.getByRole("alert", { name: "There is a problem" });
    expect(summary).toHaveFocus();
    await userEvent.click(screen.getByRole("link", { name: "Enter your email address." }));
    expect(screen.getByLabelText("Email address")).toHaveFocus();
    expect(screen.getByText("Server problem.")).toBeVisible();
  });

  it("renders nothing without errors", () => {
    const { container } = render(<ErrorSummary focusKey={0} items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
