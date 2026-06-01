#!/bin/bash

# Install shadcn/ui components script
# Run from backend/ directory: bash install-components.sh

echo "🎨 Installing shadcn/ui components..."

# Core components
echo "📦 Installing core components..."
npx shadcn@latest add -y sidebar
npx shadcn@latest add -y separator
npx shadcn@latest add -y button
npx shadcn@latest add -y card

# Form components
echo "📝 Installing form components..."
npx shadcn@latest add -y input
npx shadcn@latest add -y label
npx shadcn@latest add -y select
npx shadcn@latest add -y textarea
npx shadcn@latest add -y checkbox
npx shadcn@latest add -y form

# Feedback components
echo "💬 Installing feedback components..."
npx shadcn@latest add -y dialog
npx shadcn@latest add -y alert-dialog
npx shadcn@latest add -y alert
npx shadcn@latest add -y skeleton
npx shadcn@latest add -y sonner

# Data display
echo "📊 Installing data display components..."
npx shadcn@latest add -y table
npx shadcn@latest add -y badge
npx shadcn@latest add -y tabs
npx shadcn@latest add -y pagination

echo ""
echo "✅ All components installed!"
echo "📁 Components are in: src/shared/ui/components/"
echo ""
echo "📝 Note: We're using Sonner for toasts (not the deprecated toast component)"