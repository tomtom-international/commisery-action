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

export const GRAY = (message: string): string => `\x1b[90m${message}\x1b[0m`;
export const RED = (message: string): string => `\x1b[91m${message}\x1b[0m`;
export const GREEN = (message: string): string => `\x1b[92m${message}\x1b[0m`;
export const YELLOW = (message: string): string => `\x1b[93m${message}\x1b[0m`;
