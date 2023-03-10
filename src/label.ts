/**
 * Copyright (C) 2023, TomTom (http://tomtom.com).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
