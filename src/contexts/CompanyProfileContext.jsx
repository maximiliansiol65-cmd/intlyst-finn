import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { DASHBOARD_WIDGETS } from "../hooks/useWidgetLayout";
import {
  COMPANY_PROFILE_STORAGE_KEY,
  COMPANY_PROFILE_OPTIONS,
  getCompanyProfile,
} from "../config/companyProfiles";

const CompanyProfileContext = createContext(null);

const DASHBOARD_LAYOUT_STORAGE_KEY = "intlyst-dashboard-layout";

function buildLayout(preferredWidgets = []) {
  const ordered = [
    ...preferredWidgets,
    ...DASHBOARD_WIDGETS.map((item) => item.id).filter((id) => !preferredWidgets.includes(id)),
  ];

  return ordered.map((id) => ({ id, visible: true }));
}

export function CompanyProfileProvider({ children }) {
  const [profileId, setProfileId] = useState(() => {
    return localStorage.getItem(COMPANY_PROFILE_STORAGE_KEY) || "management_ceo";
  });

  const profile = useMemo(() => getCompanyProfile(profileId), [profileId]);

  useEffect(() => {
    localStorage.setItem(COMPANY_PROFILE_STORAGE_KEY, profile.id);
  }, [profile.id]);

  useEffect(() => {
    const accent = profile.accent || "#0F9F6E";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-soft", `${accent}22`);
    document.documentElement.style.setProperty("--accent-strong", accent);
    document.documentElement.style.setProperty("--c-primary", accent);
    document.documentElement.style.setProperty("--c-primary-hover", accent);
    localStorage.setItem("intlyst_accent", accent);

    if (!localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY)) {
      localStorage.setItem(
        DASHBOARD_LAYOUT_STORAGE_KEY,
        JSON.stringify(buildLayout(profile.preferredWidgets)),
      );
    }

    if (!localStorage.getItem("intlyst_dashboard_role")) {
      localStorage.setItem("intlyst_dashboard_role", profile.dashboardRole || "ceo");
    }
  }, [profile]);
  const value = useMemo(
    () => ({
      profileId,
      profile,
      profiles: COMPANY_PROFILE_OPTIONS,
      setProfile(profileKey) {
        setProfileId(getCompanyProfile(profileKey).id);
      },
    }),
    [profile, profileId],
  );

  return (
    <CompanyProfileContext.Provider value={value}>
      {children}
    </CompanyProfileContext.Provider>
  );
}

export function useCompanyProfile() {
  const ctx = useContext(CompanyProfileContext);
  if (!ctx) throw new Error("useCompanyProfile must be used within CompanyProfileProvider");
  return ctx;
}
