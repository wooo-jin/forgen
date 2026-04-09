# forgen — Install & First Run Demo
# Shows: npm install → forgen doctor → starter pack loaded

Output assets/demo/01-install.gif

Set Shell "zsh"
Set FontFamily "JetBrains Mono"
Set FontSize 16
Set Width 1200
Set Height 600
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set WindowBar Colorful
Set BorderRadius 10
Set Margin 20
Set MarginFill "#1e1e2e"

# Setup (hidden)
Hide
Type "cd /tmp && mkdir forgen-demo && cd forgen-demo && git init -q && npm init -y -q 2>/dev/null && clear"
Enter
Sleep 1s
Show

# Step 1: Install
Type "npm i -g forgen"
Sleep 500ms
Enter
Sleep 5s

# Step 2: Doctor check
Type "forgen doctor"
Sleep 500ms
Enter
Sleep 3s

# Step 3: Show starter pack
Type "ls ~/.compound/me/solutions/ | head -5"
Sleep 500ms
Enter
Sleep 2s

# Step 4: Show available skills
Type "ls ~/.claude/commands/forgen/ | head -10"
Sleep 500ms
Enter
Sleep 3s

# Done
Type "# Ready! 15 starter solutions + 19 skills loaded"
Sleep 500ms
Enter
Sleep 3s
