import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  GeneratorWorkspace,
  WorkspaceControls,
  WorkspaceResult,
} from "./GeneratorWorkspace";

describe("GeneratorWorkspace", () => {
  it("renders both controls and result regions", () => {
    render(
      <GeneratorWorkspace>
        <WorkspaceControls>
          <button>Generate</button>
        </WorkspaceControls>
        <WorkspaceResult>
          <p>Your generated artwork will appear here</p>
        </WorkspaceResult>
      </GeneratorWorkspace>,
    );
    expect(screen.getByTestId("generator-controls")).toBeTruthy();
    expect(screen.getByTestId("generator-result")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate" })).toBeTruthy();
  });

  it("keeps the result panel sticky on desktop and stacked on small screens", () => {
    render(
      <GeneratorWorkspace>
        <WorkspaceControls>a</WorkspaceControls>
        <WorkspaceResult>b</WorkspaceResult>
      </GeneratorWorkspace>,
    );
    const result = screen.getByTestId("generator-result");
    expect(result.className).toContain("lg:sticky");
    const grid = result.parentElement!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("lg:grid-cols-");
  });

  it("is presentation only — controls render exactly the children given", () => {
    render(
      <GeneratorWorkspace>
        <WorkspaceControls>
          <span>only-child</span>
        </WorkspaceControls>
        <WorkspaceResult>x</WorkspaceResult>
      </GeneratorWorkspace>,
    );
    expect(screen.getByTestId("generator-controls").textContent).toBe("only-child");
  });
});
