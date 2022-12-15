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

import { AnnotationProperties } from "@actions/core";
import { EOL } from "os";

/**
 * Range interface
 */
export interface ILlvmRange {
  start: number;
  range?: number;
}

/**
 * LlvmMessage Class interface
 */
export interface ILlvmMessage {
  columnNumber?: ILlvmRange;
  expectations?: string;
  filePath?: string;
  level?: LlvmLevel;
  line?: string;
  lineNumber?: ILlvmRange;
  message?: string;
}

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

export class LlvmMessage {
  columnNumber: ILlvmRange;
  expectations?: string;
  filePath?: string;
  level: LlvmLevel;
  line?: string;
  lineNumber: ILlvmRange;
  message?: string;

  constructor({
    columnNumber: columnNumber,
    expectations,
    filePath: filePath,
    level = LlvmLevel.NOTE,
    line,
    lineNumber: lineNumber,
    message,
  }: ILlvmMessage) {
    this.columnNumber = columnNumber ?? { start: 1, range: undefined };
    this.expectations = expectations;
    this.filePath = filePath;
    this.level = level;
    this.line = line;
    this.lineNumber = lineNumber ?? { start: 1, range: undefined };
    this.message = message;
  }

  getAnnotationProperties(): AnnotationProperties {
    const props: AnnotationProperties = {
      file: this.filePath,
      title: this.message,
      startLine: this.lineNumber.start,
      startColumn: this.columnNumber.start,
    };

    if (this.lineNumber.range !== undefined) {
      props.endLine = this.lineNumber.start + this.lineNumber.range;
    }

    if (this.columnNumber.range !== undefined) {
      props.endColumn = this.columnNumber.start + this.columnNumber.range;
    }

    return props;
  }

  report(): string {
    let message = "";

    if (this.filePath) {
      message = `${this.filePath}:${this.lineNumber.start}:${
        this.columnNumber.start + 1
      }: `;
    }

    message = formatString(
      `${message}${formatLevel(this.level)}: ${this.message}`,
      TextFormat.BOLD
    );

    if (this.line === undefined) {
      return message;
    }

    const indicatorColor = this.expectations
      ? TextFormat.LIGHT_GREEN
      : TextFormat.RED;

    let indicator =
      this.line.trimEnd() +
      EOL +
      " ".repeat(this.columnNumber.start - 1) +
      formatString("^", indicatorColor);

    if (this.columnNumber.range !== undefined) {
      if (this.columnNumber.range > 1) {
        indicator += formatString(
          "~".repeat(this.columnNumber.range - 1),
          indicatorColor
        );
      }
    }

    if (this.expectations !== undefined) {
      indicator +=
        EOL + " ".repeat(this.columnNumber.start - 1) + this.expectations;
    }

    return message + EOL + indicator;
  }
}

export class LlvmError extends LlvmMessage {
  level: LlvmLevel = LlvmLevel.ERROR;
}

export class LlvmWarning extends LlvmMessage {
  level: LlvmLevel = LlvmLevel.WARNING;
}
