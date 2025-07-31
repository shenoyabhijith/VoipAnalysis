#!/bin/bash

# VoIP Analysis Tool Deployment Script
# This script helps deploy the application to GitHub Pages

echo "🚀 VoIP Analysis Tool Deployment Script"
echo "======================================"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Git repository not found. Please run 'git init' first."
    exit 1
fi

# Check if remote origin is set
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "⚠️  No remote origin found."
    echo "Please add your GitHub repository as remote:"
    echo "git remote add origin https://github.com/YOUR_USERNAME/VoipAnalysis.git"
    echo ""
    read -p "Enter your GitHub username: " github_username
    if [ ! -z "$github_username" ]; then
        git remote add origin https://github.com/$github_username/VoipAnalysis.git
        echo "✅ Remote origin added"
    else
        echo "❌ No username provided. Please add remote manually."
        exit 1
    fi
fi

# Add all files
echo "📁 Adding files to git..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "Update VoIP Analysis Tool - $(date)"

# Push to GitHub
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Go to your GitHub repository"
echo "2. Navigate to Settings > Pages"
echo "3. Select 'Deploy from a branch'"
echo "4. Choose 'main' branch and '/ (root)' folder"
echo "5. Click Save"
echo ""
echo "🌐 Your site will be available at: https://YOUR_USERNAME.github.io/VoipAnalysis"
echo "" 