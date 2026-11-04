# About Us Page - Customization Guide

## Overview
The About Us page has been successfully implemented with 4 team member placeholders that you can easily customize.

## Files Created

### Controller & View
- **[aboutController.ts](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/src/controllers/aboutController.ts)** - Handles the route logic and team data
- **[about.njk](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/views/about.njk)** - HTML template for the About Us page
- **[about.css](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/public/css/about.css)** - Page styling

### Placeholder Images
- [team-member-1.png](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/public/css/images/team-member-1.png)
- [team-member-2.png](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/public/css/images/team-member-2.png)
- [team-member-3.png](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/public/css/images/team-member-3.png)
- [team-member-4.png](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/public/css/images/team-member-4.png)

### Tests
- **[about.test.ts](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/tests/about.test.ts)** - Comprehensive test suite for the About Us page

---

## How to Customize

### Option 1: Edit Team Member Information in the Controller (RECOMMENDED)

The easiest way to customize the team members is to edit the `aboutController.ts` file.

**Location:** `src/controllers/aboutController.ts`

**Current structure:**
```typescript
const teamMembers: TeamMember[] = [
  {
    name: "Alex Thompson",
    role: "Founder & Owner",
    bio: "With over 15 years of competitive pool experience, Alex founded Cue Corner to bring professional-grade equipment to every player.",
    image: "/css/images/team-member-1.png",
  },
  // ... more team members
];
```

**To edit a team member:**

1. Open [aboutController.ts](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/src/controllers/aboutController.ts)
2. Find the `teamMembers` array
3. Update the fields you want to change:
   - `name` - Team member's full name
   - `role` - Their title/position
   - `bio` - A short description (2-3 sentences)
   - `image` - Path to their photo

**Example:**
```typescript
{
  name: "John Smith",              // Change name
  role: "Sales Manager",            // Change role
  bio: "John brings 10 years of retail experience to the team.",  // Change bio
  image: "/css/images/team-member-1.png",  // Points to image file
}
```

---

### Option 2: Replace Placeholder Images with Real Photos

The placeholder images are currently SVG files (disguised as .png). You can replace them with actual photos.

**Steps:**

1. **Prepare your image:**
   - Use a photo of the team member (JPG, PNG, or WebP)
   - Recommended size: 400×300 pixels (or similar aspect ratio)
   - Keep file size under 200KB for best performance

2. **Replace the image:**
   - Save your image to `/public/css/images/team-member-1.png` (or 2, 3, 4)
   - The system will automatically use your new image instead of the placeholder
   - No code changes needed!

3. **Alternative: Use a different path:**
   - If you want to keep images elsewhere, update the `image` field in the controller:
   ```typescript
   image: "/path/to/your/image.jpg",  // New path
   ```

**Example workflow:**
```bash
# 1. Copy your real photo to the images folder
cp ~/Downloads/alex-thompson-photo.jpg public/css/images/team-member-1.png

# 2. (Optional) Update the filename in aboutController.ts
# Change: image: "/css/images/team-member-1.png"
# To:     image: "/css/images/alex-thompson-photo.jpg"

# 3. Done! The page will automatically display the real photo
```

---

### Option 3: Update Mission Statement and Benefits

You can also customize the mission statement and benefits sections.

**Mission Statement:**
- File: [about.njk](/Users/jackluter/academy-repos/the-achievers/the-achievers-frontend/views/about.njk)
- Look for the section with `id="mission-title"`
- Edit the paragraph text

**Benefits Section (Why Choose Cue Corner?):**
- Same file, look for `id="why-title"`
- Edit the heading and paragraph text in each `.benefit-card`

---

## Testing Your Changes

### Run the development server:
```bash
npm run dev
```
Then visit: `http://localhost:5173/about`

### Run automated tests:
```bash
npm run test
```

The tests verify that:
- The page loads successfully
- All 4 team members are displayed
- Names, roles, and biographies are present
- Images are linked correctly
- Navigation and styling work properly

---

## Customization Examples

### Example 1: Update First Team Member
**File:** `src/controllers/aboutController.ts`

```typescript
{
  name: "Jane Smith",
  role: "CEO",
  bio: "Jane is the driving force behind Cue Corner's success, with 20 years in the sporting goods industry.",
  image: "/css/images/team-member-1.png",
}
```

### Example 2: Add Company Logo to Images
If you want images to match the brand better, consider:
- Using images with consistent branding
- Keeping aspect ratio 400×300 or similar
- Ensuring good contrast and readability

### Example 3: Update Mission Statement
**File:** `views/about.njk`, find this section and edit:

```njk
<p class="mission-text">
  YOUR NEW MISSION STATEMENT HERE
</p>
```

---

## File Structure Reference

```
the-achievers-frontend/
├── src/
│   └── controllers/
│       └── aboutController.ts          ← Team data is here
├── public/
│   └── css/
│       ├── about.css                   ← Styling
│       └── images/
│           ├── team-member-1.png       ← Replace with real photo
│           ├── team-member-2.png
│           ├── team-member-3.png
│           └── team-member-4.png
├── views/
│   └── about.njk                        ← HTML template
└── tests/
    └── about.test.ts                   ← Automated tests
```

---

## Styling Customization

The page is styled in `/public/css/about.css`. You can customize:

- **Colors:** Brand colors are used (green #1a472a, gold #d4af37)
- **Font sizes:** All responsive and adjust for mobile
- **Layout:** Grid layout adapts to screen size
- **Animations:** Hover effects on team cards

**Common customizations:**
```css
/* Change background color of mission section */
.about-mission {
  background-color: #f9f9f9;  /* Light gray */
}

/* Change team card hover effect */
.team-card:hover {
  transform: translateY(-5px);  /* Moves up on hover */
}

/* Change text color */
.team-name {
  color: #1a472a;  /* Dark green */
}
```

---

## Troubleshooting

### Images not showing?
- Check the file path is correct (case-sensitive on Mac/Linux)
- Ensure image is in `/public/css/images/`
- Verify file is a supported format (PNG, JPG, WebP, SVG)

### Text changes not appearing?
- Make sure you saved the file
- Run `npm run dev` to restart the dev server
- Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)

### Tests failing?
- Run `npm run test` to see which tests failed
- Ensure all team member data is properly formatted
- Check for typos in names and text

---

## Next Steps

1. ✅ About Us page is live and accessible at `/about`
2. ✅ All 4 team member placeholders are ready to customize
3. ✅ Automated tests verify everything works
4. **Next:** Update the team member information with real names, roles, and photos
5. **Optional:** Customize mission statement and benefits to match your brand

**Ready to get started?** Open `src/controllers/aboutController.ts` and update the team member data!
