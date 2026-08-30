import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  GeneratorWorkspace,
  WorkspaceControls,
  WorkspaceResult,
  WorkspaceWideResult,
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

describe("GeneratorWorkspace wide result", () => {
  it("renders wide surfaces outside the controls column, spanning both columns", () => {
    render(
      <GeneratorWorkspace>
        <WorkspaceControls>controls</WorkspaceControls>
        <WorkspaceResult>result</WorkspaceResult>
        <WorkspaceWideResult>
          <div>provider comparison</div>
        </WorkspaceWideResult>
      </GeneratorWorkspace>,
    );
    const wide = screen.getByTestId("generator-wide-result");
    expect(wide.className).toContain("lg:col-span-2");
    expect(screen.getByTestId("generator-controls").textContent).toBe("controls");
    expect(wide.textContent).toBe("provider comparison");
  });

  it("uses a header-safe sticky offset and matching max height", () => {
    render(
      <GeneratorWorkspace>
        <WorkspaceControls>a</WorkspaceControls>
        <WorkspaceResult>b</WorkspaceResult>
      </GeneratorWorkspace>,
    );
    const result = screen.getByTestId("generator-result");
    expect(result.className).toContain("lg:top-[72px]");
    expect(result.className).toContain("lg:max-h-[calc(100vh-88px)]");
    expect(result.className).not.toContain("lg:top-4");
  });

  it("top-aligns and scrolls populated content, centres empty/loading states", () => {
    const { rerender } = render(
      <GeneratorWorkspace>
        <WorkspaceControls>a</WorkspaceControls>
        <WorkspaceResult align="top">tall</WorkspaceResult>
      </GeneratorWorkspace>,
    );
    let result = screen.getByTestId("generator-result");
    expect(result.className).toContain("items-start");
    expect(result.className).toContain("overflow-y-auto");
    rerender(
      <GeneratorWorkspace>
        <WorkspaceControls>a</WorkspaceControls>
        <WorkspaceResult align="center">empty</WorkspaceResult>
      </GeneratorWorkspace>,
    );
    result = screen.getByTestId("generator-result");
    expect(result.className).toContain("items-center");
  });
});
