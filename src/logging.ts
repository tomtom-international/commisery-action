/**
 * Copyright (C) 2022, TomTom (http://tomtom.com).
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

import * as os from "os";

// eslint-disable-next-line no-shadow
export enum LlvmLevel {
  ERROR = "ERROR",
  WARNING = "WARNING",
  NOTE = "NOTE",
}

// eslint-disable-next-line no-shadow
enum TextFormat {
  BOLD = 1,
  RED = 31,
  BLUE = 34,
  LIGHT_GREEN = 92,
  CYAN = 94,
}

function formatLevel(level: LlvmLevel): string {
  switch (level) {
    case LlvmLevel.ERROR:
      return formatString("error", TextFormat.RED);
    case LlvmLevel.WARNING:
      return formatString("warning", TextFormat.CYAN);
    case LlvmLevel.NOTE:
      return formatString("note", TextFormat.LIGHT_GREEN);
  }
}

function formatString(message: string, color: TextFormat): string {
  return `\x1b[${color.toString()}m${message}\x1b[0m`;
}

export class LlvmRange {
  start = 1;
  range: number | undefined = undefined;

  constructor(start = 1, range: number | undefined = undefined) {
    this.start = start;
    this.range = range;
  }
}

export class LlvmMessage {
  column_number: LlvmRange = new LlvmRange();
  expectations: string | undefined = undefined;
  file_path: string | undefined = undefined;
  level: LlvmLevel = LlvmLevel.NOTE;
  line: string | undefined = undefined;
  line_number: LlvmRange = new LlvmRange();
  message: string | undefined = undefined;

  report(): string {
    let _message = "";

    if (this.file_path) {
      _message = `${this.file_path}:${this.line_number.start}:${this.column_number.start}: `;
    }

    _message = formatString(
      `${_message}${formatLevel(this.level)}: ${this.message}`,
      TextFormat.BOLD
    );

    if (this.line === undefined) {
      return _message;
    }

    const indicator_color = this.expectations
      ? TextFormat.LIGHT_GREEN
      : TextFormat.RED;
    let _indicator =
      this.line.trimEnd() +
      os.EOL +
      " ".repeat(this.column_number.start - 1) +
      formatString("^", indicator_color);

    if (this.column_number.range !== undefined) {
      _indicator += formatString(
        "~".repeat(this.column_number.range - 1),
        indicator_color
      );
    }

    if (this.expectations !== undefined) {
      _indicator +=
        os.EOL + " ".repeat(this.column_number.start - 1) + this.expectations;
    }

    return _message + os.EOL + _indicator;
  }
}

export class LlvmError extends LlvmMessage {
  level: LlvmLevel = LlvmLevel.ERROR;
}
