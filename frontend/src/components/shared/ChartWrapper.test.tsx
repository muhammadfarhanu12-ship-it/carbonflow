import { render, screen } from "@testing-library/react";
import { BarChart } from "recharts";
import { ChartWrapper } from "./ChartWrapper";

describe("ChartWrapper", () => {
  test("renders loading state while chart data is loading", () => {
    render(
      <ChartWrapper loading hasData className="h-48">
        <BarChart data={[]} />
      </ChartWrapper>,
    );

    expect(screen.getByText("Loading chart...")).toBeInTheDocument();
  });

  test("renders empty state when no chart data is available", () => {
    render(
      <ChartWrapper loading={false} hasData={false} emptyMessage="No data yet" className="h-48">
        <BarChart data={[]} />
      </ChartWrapper>,
    );

    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });
});
