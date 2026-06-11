import { describe, it, expect } from "vitest";
import {
  NAV_HOME,
  NAV_GROUPS,
  NAV_OPERATOR,
  isNavActive,
} from "@/components/AppSidebar";
import { CRUMB_MAP, crumbLabelFor } from "@/components/AppTopbar";

const ALL_ITEMS = [
  NAV_HOME,
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_OPERATOR,
];

describe("sidebar navigation structure", () => {
  it("groups appear in product order: Tenders, Grants, Investors, workspace", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "Tenders",
      "Grants",
      "Investors",
      "Your workspace",
    ]);
  });

  it("Home sits above the groups and matches exactly", () => {
    expect(NAV_HOME).toMatchObject({ href: "/", label: "Home", exact: true });
  });

  it("Tenders group contains the tender routes", () => {
    expect(NAV_GROUPS[0].items.map((i) => [i.label, i.href])).toEqual([
      ["Find tenders", "/opportunities"],
      ["Matched to you", "/my-opportunities"],
      ["Bid pipeline", "/pipeline"],
      ["Buyers", "/buyers"],
    ]);
  });

  it("Grants group contains the grant routes", () => {
    expect(NAV_GROUPS[1].items.map((i) => [i.label, i.href])).toEqual([
      ["Find grants", "/grants"],
      ["Matched to you", "/my-grants"],
      ["My applications", "/my-applications"],
      ["Funders", "/funders"],
    ]);
  });

  it("Investors group contains events and programmes", () => {
    expect(NAV_GROUPS[2].items.map((i) => i.href)).toEqual([
      "/investor-events",
      "/programmes",
    ]);
  });

  it("workspace group keeps the shared tools, with Ask and Evidence library labels", () => {
    const workspace = NAV_GROUPS[3].items;
    expect(workspace.map((i) => i.href)).toEqual([
      "/ask",
      "/documents",
      "/clients",
      "/responses",
      "/review",
      "/alerts",
      "/compliance",
      "/history",
      "/profile",
      "/team",
    ]);
    expect(workspace.find((i) => i.href === "/ask")?.label).toBe("Ask");
    expect(workspace.find((i) => i.href === "/documents")?.label).toBe(
      "Evidence library",
    );
  });

  it("keeps the Team owner/admin gate and operator gates on Sources + Admin", () => {
    const team = NAV_GROUPS[3].items.find((i) => i.href === "/team");
    expect(team?.ownerAdmin).toBe(true);
    expect(NAV_OPERATOR.map((i) => i.href)).toEqual(["/sources", "/admin"]);
    expect(NAV_OPERATOR.every((i) => i.operatorOnly)).toBe(true);
  });

  it("every route appears at most once", () => {
    const hrefs = ALL_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("no internal jargon in any user-facing label", () => {
    const labels = [
      ...ALL_ITEMS.map((i) => i.label),
      ...NAV_GROUPS.map((g) => g.label),
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/\b(rfp|chunks?|extraction|intelligence)\b/i);
    }
  });
});

describe("isNavActive", () => {
  it("Home is active only on the exact root path", () => {
    expect(isNavActive("/", "/", true)).toBe(true);
    expect(isNavActive("/grants", "/", true)).toBe(false);
  });

  it("nested routes highlight their parent item", () => {
    expect(isNavActive("/grants/abc-123", "/grants")).toBe(true);
    expect(isNavActive("/opportunities/55/gaps", "/opportunities")).toBe(true);
    expect(
      isNavActive("/investor-events/organizers/x", "/investor-events"),
    ).toBe(true);
  });

  it("does not highlight lookalike prefixes", () => {
    expect(isNavActive("/grant-sources", "/grants")).toBe(false);
    expect(isNavActive("/my-grants", "/grants")).toBe(false);
  });
});

describe("crumbLabelFor", () => {
  it("labels the core pages in plain English", () => {
    expect(crumbLabelFor("/")).toBe("Home");
    expect(crumbLabelFor("/opportunities")).toBe("Find tenders");
    expect(crumbLabelFor("/grants")).toBe("Find grants");
    expect(crumbLabelFor("/my-grants")).toBe("Matched to you");
    expect(crumbLabelFor("/my-applications")).toBe("My applications");
    expect(crumbLabelFor("/funders")).toBe("Funders");
    expect(crumbLabelFor("/programmes")).toBe("Programmes");
    expect(crumbLabelFor("/investor-events")).toBe("Investor events");
    expect(crumbLabelFor("/documents")).toBe("Evidence library");
  });

  it("nested routes inherit the most specific label", () => {
    expect(crumbLabelFor("/grants/some-grant-id")).toBe("Find grants");
    expect(crumbLabelFor("/funders/Innovate%20UK")).toBe("Funders");
    expect(crumbLabelFor("/buyers/some-buyer")).toBe("Buyers");
    expect(crumbLabelFor("/review/42")).toBe("Review queue");
    expect(crumbLabelFor("/investor-events/organizers/some-org")).toBe(
      "Event organiser",
    );
  });

  it("dynamic-segment keys match real URLs", () => {
    expect(crumbLabelFor("/opportunities/abc123/gaps")).toBe("Evidence gaps");
    expect(crumbLabelFor("/clients/9f3/evidence")).toBe("Evidence vault");
    // sibling detail pages fall back to the section label
    expect(crumbLabelFor("/opportunities/abc123")).toBe("Find tenders");
    expect(crumbLabelFor("/clients/9f3")).toBe("Clients");
  });

  it("legacy answer-builder draft path gets a plain-English label", () => {
    expect(crumbLabelFor("/rfp/drafts/some-draft")).toBe("Application");
  });

  it("deleted routes no longer carry crumb labels", () => {
    // /demo, /rfp and /rfp/history were removed (E2E review v1); only the
    // guided drafts flow under /rfp/drafts survives.
    expect(CRUMB_MAP).not.toHaveProperty("/demo");
    expect(CRUMB_MAP).not.toHaveProperty("/rfp");
    expect(CRUMB_MAP).not.toHaveProperty("/rfp/history");
  });

  it("never renders 'Page' for any app route", () => {
    const routes = [
      "/",
      "/admin",
      "/alerts",
      "/ask",
      "/buyers",
      "/buyers/crown-commercial",
      "/clients",
      "/clients/1",
      "/clients/1/evidence",
      "/compliance",
      "/compliance/1",
      "/documents",
      "/funders",
      "/funders/innovate-uk",
      "/grant-sources",
      "/grants",
      "/grants/1",
      "/history",
      "/investor-events",
      "/investor-events/organizers/some-slug",
      "/my-applications",
      "/my-grants",
      "/my-opportunities",
      "/opportunities",
      "/opportunities/1",
      "/opportunities/1/buyer",
      "/opportunities/1/gaps",
      "/opportunities/1/rfp",
      "/pipeline",
      "/profile",
      "/programmes",
      "/responses",
      "/review",
      "/review/1",
      "/rfp/drafts/1",
      "/sources",
      "/team",
    ];
    for (const route of routes) {
      const label = crumbLabelFor(route);
      expect(label).not.toBe("Page");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a humanised segment for unmapped routes", () => {
    expect(crumbLabelFor("/auth/update-password")).toBe("Update password");
  });

  it("no internal jargon in any crumb label", () => {
    for (const label of Object.values(CRUMB_MAP)) {
      expect(label).not.toMatch(/\b(rfp|chunks?|extraction)\b/i);
    }
  });
});
