#!/bin/bash

# Copyright (C) 2020-2020, TomTom (http://tomtom.com).
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

echo "Running Commisery for ${GITHUB_REPOSITORY}, Pull Request #${INPUT_PULL_REQUEST}"

OUTPUT="$(python3 /commisery_action.py --token=${INPUT_TOKEN} --repository=${GITHUB_REPOSITORY} --pull-request-id=${INPUT_PULL_REQUEST} 2>&1)"
echo "$OUTPUT"

if [ -n "$OUTPUT" ]
then
    # 1. Remove ANSI Color codes
    # 2. Replace \n with %0A to allow new lines in annotations
    ANNOTATION=`echo "$OUTPUT" | sed 's/\x1b\[[0-9;]*m//g' | sed ':a;N;$!ba;s/\n/%0A/g'`
    echo "::error ::$ANNOTATION"
    exit 1
fi