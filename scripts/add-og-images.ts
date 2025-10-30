#!/usr/bin/env node
/**
 * Script to automatically add og_image frontmatter to all MDX files that contain images.
 * This script:
 * 1. Finds the first image in each MDX file
 * 2. Copies it to public/og-images/ with a predictable name
 * 3. Adds og_image: /og-images/[name].ext to the frontmatter
 */

import {copyFile, mkdir, readFile, writeFile} from 'fs/promises';
import path from 'path';

import matter from 'gray-matter';

import getAllFilesRecursively from '../src/files';

const root = process.cwd();
const OG_IMAGES_DIR = path.join(root, 'public', 'og-images');

// Simple regex to find markdown images ![alt](path)
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/;

async function addOgImageToFile(filePath: string, fileSlug: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf8');
    const {data: frontmatter, content: markdownContent} = matter(content);

    // Find the first image in the content
    const imageMatch = markdownContent.match(IMAGE_REGEX);

    if (!imageMatch) {
      // No images found
      return false;
    }

    const imagePath = imageMatch[2];

    // Skip external images (we only want local images)
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return false;
    }

    // Resolve the source image path relative to the MDX file
    const mdxDir = path.dirname(filePath);
    let sourceImagePath: string;

    if (imagePath.startsWith('./')) {
      // Relative to MDX file
      sourceImagePath = path.join(mdxDir, imagePath);
    } else if (imagePath.startsWith('/')) {
      // Absolute from project root (public folder)
      sourceImagePath = path.join(root, 'public', imagePath);
    } else {
      // Relative without ./
      sourceImagePath = path.join(mdxDir, imagePath);
    }

    // Create OG images directory if it doesn't exist
    await mkdir(OG_IMAGES_DIR, {recursive: true});

    // Create a predictable OG image filename based on the page slug
    const imageExt = path.extname(sourceImagePath);
    const ogImageName = `${fileSlug.replace(/\//g, '-')}${imageExt}`;
    const ogImagePath = path.join(OG_IMAGES_DIR, ogImageName);
    const ogImageUrl = `/og-images/${ogImageName}`;

    // Always copy the source image (even if frontmatter exists)
    // This is important because og-images/ is gitignored and needs to be regenerated on each build
    try {
      await copyFile(sourceImagePath, ogImagePath);
    } catch (copyError) {
      console.error(
        `❌ Could not copy image for ${path.relative(root, filePath)}:`,
        (copyError as Error).message
      );
      return false;
    }

    // Check if frontmatter needs updating
    if (frontmatter.og_image === ogImageUrl) {
      // Already correct, just return true (image was copied successfully)
      return true;
    }

    // Add or update og_image in frontmatter with absolute path
    frontmatter.og_image = ogImageUrl;

    // Reconstruct the file with updated frontmatter
    const newContent = matter.stringify(markdownContent, frontmatter);
    await writeFile(filePath, newContent, 'utf8');

    console.log(`✅ Added og_image to ${path.relative(root, filePath)}: ${ogImageUrl}`);
    return true;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    return false;
  }
}

async function main() {
  const docsFolders = ['docs', 'develop-docs'];
  let totalUpdated = 0;
  let totalScanned = 0;
  let copyErrors = 0;

  // Create og-images directory
  await mkdir(OG_IMAGES_DIR, {recursive: true});
  console.log(`📁 Created ${path.relative(root, OG_IMAGES_DIR)} directory\n`);

  for (const folder of docsFolders) {
    const folderPath = path.join(root, folder);

    try {
      const files = await getAllFilesRecursively(folderPath);

      const mdxFiles = files.filter(
        file => path.extname(file) === '.mdx' || path.extname(file) === '.md'
      );

      console.log(`Scanning ${mdxFiles.length} files in ${folder}/...`);

      for (const file of mdxFiles) {
        totalScanned++;
        // Generate slug from file path (relative to folder, without extension)
        const relativePath = path.relative(folderPath, file);
        const fileSlug = relativePath
          .replace(/\.(mdx|md)$/, '')
          .replace(/\/index$/, '')
          .replace(/\\/g, '/'); // Normalize Windows paths

        const result = await addOgImageToFile(file, fileSlug);
        if (result === true) {
          totalUpdated++;
        } else if (result === false) {
          // This could be from copy errors, count them
          const content = await readFile(file, 'utf8');
          const {content: markdownContent} = matter(content);
          const imageMatch = markdownContent.match(IMAGE_REGEX);

          if (imageMatch && !imageMatch[2].startsWith('http')) {
            // Had an image but failed to process
            copyErrors++;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing folder ${folder}:`, error);
      process.exit(1);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Scanned: ${totalScanned} files`);
  console.log(`   Updated: ${totalUpdated} files`);
  console.log(`   Copied: ${totalUpdated} images to public/og-images/`);
  console.log(`   Errors: ${copyErrors} files failed to copy`);
  console.log(
    `   Skipped: ${totalScanned - totalUpdated - copyErrors} files (no images or og_image already set)`
  );

  if (copyErrors > 0) {
    console.log(`\n⚠️  Warning: ${copyErrors} files had image copy errors`);
    console.log('   These files will use the default OG image.');
  }
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
