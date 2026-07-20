"use client";

import { useEffect, useState } from "react";

export interface Session {
  playerId: string;
  secret: string;
  name: string;
}

const key = (code: string) => `coup.session.${code.toUpperCase()}`;

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s.playerId && s.secret ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, s: Session) {
  try {
    localStorage.setItem(key(code), JSON.stringify(s));
    localStorage.setItem("coup.name", s.name);
  } catch {}
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {}
}

export function lastName(): string {
  try {
    return localStorage.getItem("coup.name") ?? "";
  } catch {
    return "";
  }
}

/** Name input state, prefilled from localStorage after hydration. */
export function useSavedName(): [string, (s: string) => void] {
  const [name, setName] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setName((cur) => (cur ? cur : lastName())), 0);
    return () => clearTimeout(id);
  }, []);
  return [name, setName];
}
