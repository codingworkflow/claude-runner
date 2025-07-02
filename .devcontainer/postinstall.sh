#!/bin/bash

npm install
npm run setup

# Setup Claude configuration directory
mkdir -p /workspace/.claude
ln -sf /workspace/.claude /home/vscode/.claude 2>/dev/null || true

# Install Claude Code CLI globally for testing
npm install -g @anthropic-ai/claude-code

# Add useful aliases for development
echo 'alias ll="ls -alF"' >> ~/.bashrc
echo 'alias cl="claude --dangerously-skip-permissions"' >> ~/.bashrc
echo 'alias g="git"' >> ~/.bashrc
echo 'alias gc="git add -A && git commit -m"' >> ~/.bashrc
echo 'alias gp="git fetch --all && git pull"' >> ~/.bashrc
echo 'alias gf="git fetch --all && git rebase origin/master"' >> ~/.bashrc
echo 'alias gn="git checkout -b"' >> ~/.bashrc
echo 'alias pr="git push origin $(git rev-parse --abbrev-ref HEAD)"' >> ~/.bashrc
echo 'alias gpr="gc pr"' >> ~/.bashrc
echo 'export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1' >> ~/.bashrc
echo 'export SONAR_SCANNER_VERSION=7.0.2.4839'
echo 'export SONAR_SCANNER_HOME=$HOME/.sonar/sonar-scanner-$SONAR_SCANNER_VERSION-linux-x64'
echo 'export PATH=$SONAR_SCANNER_HOME/bin:$PATH'

yes | npx playwright install --with-deps --no-shell

# Setup SonarQube Scanner (optional for code quality)
if [ -f .sonar ]; then
  export SONAR_SCANNER_VERSION=7.0.2.4839
  export SONAR_SCANNER_HOME=$HOME/.sonar/sonar-scanner-$SONAR_SCANNER_VERSION-linux-x64
  curl --create-dirs -sSLo $HOME/.sonar/sonar-scanner.zip https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-$SONAR_SCANNER_VERSION-linux-x64.zip
  unzip -o $HOME/.sonar/sonar-scanner.zip -d $HOME/.sonar/
  export PATH=$SONAR_SCANNER_HOME/bin:$PATH
  echo 'export PATH=$HOME/.sonar/sonar-scanner-'$SONAR_SCANNER_VERSION'-linux-x64/bin:$PATH' >> ~/.bashrc
fi