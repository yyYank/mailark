#!/bin/bash
set -euo pipefail

xattr -dr com.apple.quarantine /Applications/mailark.app
