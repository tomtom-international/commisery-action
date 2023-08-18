/*
 * SPDX-FileCopyrightText: 2023 TomTom <http://tomtom.com>
 * SPDX-License-Identifier: Apache-2.0
 */

type TLabelCategory = "bump" | "type" | "scope" | "initial development";

export function getCategory(value: string): string {
  return value.split(":")[0];
}

export function isCategory(value: string, category: TLabelCategory): boolean {
  return getCategory(value) === category;
}

export function isManaged(value: string): boolean {
  return ["bump", "type", "initial development"].includes(getCategory(value));
}

export function create(category: TLabelCategory, value?: string): string {
  if (category !== "initial development" && value === undefined) {
    throw new Error(`Label category '${category}' needs to have a value`);
  }

  if (value) {
    return `${category}:${value}`.toLowerCase();
  }
  return category;
}
