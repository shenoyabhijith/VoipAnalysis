# VoIP Analysis Tool - Deployment Guide

This guide will walk you through creating a private GitHub repository and deploying your VoIP Analysis Tool to GitHub Pages.

## Prerequisites

- GitHub account
- Git installed on your machine
- Basic knowledge of command line

## Step 1: Create Private GitHub Repository

1. **Go to GitHub.com** and sign in to your account

2. **Create New Repository**:
   - Click the "+" icon in the top right corner
   - Select "New repository"

3. **Repository Settings**:
   - **Repository name**: `VoipAnalysis`
   - **Description**: `A comprehensive web-based tool for analyzing PSTN and VoIP traffic patterns and bandwidth requirements`
   - **Visibility**: Select "Private"
   - **DO NOT** check "Add a README file"
   - **DO NOT** check "Add .gitignore"
   - **DO NOT** check "Choose a license"
   - Click "Create repository"

## Step 2: Connect Local Repository to GitHub

After creating the repository, GitHub will show you commands. Run these in your terminal:

```bash
# Replace YOUR_USERNAME with your actual GitHub username
git remote add origin https://github.com/YOUR_USERNAME/VoipAnalysis.git
git push -u origin main
```

## Step 3: Enable GitHub Pages

1. **Go to Repository Settings**:
   - Navigate to your `VoipAnalysis` repository on GitHub
   - Click the "Settings" tab

2. **Configure Pages**:
   - Scroll down to "Pages" in the left sidebar
   - Under "Source", select "Deploy from a branch"
   - Choose "main" branch
   - Select "/ (root)" folder
   - Click "Save"

3. **Wait for Deployment**:
   - GitHub will automatically deploy your site
   - You'll see a green checkmark when deployment is complete
   - Your site will be available at: `https://YOUR_USERNAME.github.io/VoipAnalysis`

## Step 4: Verify Deployment

1. **Check GitHub Actions**:
   - Go to the "Actions" tab in your repository
   - You should see a successful deployment workflow

2. **Test Your Site**:
   - Visit `https://YOUR_USERNAME.github.io/VoipAnalysis`
   - Verify all features work correctly
   - Test the VoIP and PSTN analysis functionality

## Step 5: Future Updates

To update your deployed site:

```bash
# Make your changes to the files
git add .
git commit -m "Description of your changes"
git push origin main
```

GitHub will automatically redeploy your site when you push changes.

## Troubleshooting

### Common Issues:

1. **Site not loading**:
   - Check GitHub Actions for deployment errors
   - Ensure all files are committed and pushed
   - Verify the repository is public (for free accounts) or you have GitHub Pro

2. **404 errors**:
   - Make sure `index.html` is in the root directory
   - Check that the branch and folder settings are correct in Pages settings

3. **Styling issues**:
   - Ensure all CSS and JavaScript files are properly linked
   - Check browser console for errors

### GitHub Pages Limitations:

- **Private repositories**: Require GitHub Pro for Pages
- **Custom domains**: Can be configured in repository settings
- **HTTPS**: Automatically enabled for GitHub Pages

## Security Notes

- Your Gemini API key is stored locally in the browser
- No server-side storage of sensitive data
- All calculations happen client-side

## Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Verify all files are properly committed
3. Ensure the repository settings are correct

Your VoIP Analysis Tool should now be successfully deployed and accessible via GitHub Pages! 