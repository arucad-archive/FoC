const username = "arucad-archive";
const repo = "FoC";

let allProjects = [];     
let filteredProjects = []; 
let visibleCount = 0;     
let isLoading = false; // Guard flag to prevent duplicate batch triggers

const INITIAL_LOAD = 9;   // Preloaded works count
const BATCH_LOAD = 3;     // Batch count on scroll

let observer = null; 

// Helper function to turn titles into clean Fancybox group names (e.g., "Templos Zeytinlik" -> "templos-zeytinlik")
function slugify(text) {
    if (!text) return "project";
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove non-word chars
        .replace(/\-\-+/g, '-');        // Replace multiple - with single -
}

document.addEventListener("DOMContentLoaded", () => {
    setupIntersectionObserver();
    fetchProjects();
    
    // Bind Fancybox 5 with isolated items and disabled navigation arrows
    if (typeof Fancybox !== "undefined") {
        Fancybox.bind("[data-fancybox]", {
            infinite: false,
            Navigation: false,
            iframe: {
                preload: false,
                attr: {
                    scrolling: "auto"
                }
            },
            // Prevents the lightbox container from panning/moving when dragging the 3D model
            Carousel: {
                Panzoom: {
                    touch: (panzoom, event) => {
                        return event?.target.nodeName === "MODEL-VIEWER" ? false : true;
                    }
                }
            },
            on: {
                done: (fancybox, slide) => {
                    // Forces model-viewer to re-evaluate dimensions once lightbox transition completes
                    const viewer = slide.el.querySelector("model-viewer");
                    if (viewer && typeof viewer.dismissPoster === "function") {
                        viewer.dismissPoster();
                    }
                }
            }
        });
    }
});

function fetchProjects() {
    console.log("Fetching projects from GitHub...");

    const projectsFolder = `https://api.github.com/repos/${username}/${repo}/contents/content/projects`;
    const finalsFolder   = `https://api.github.com/repos/${username}/${repo}/contents/content/finals`;

    Promise.allSettled([
        fetch(projectsFolder).then(res => res.ok ? res.json() : []),
        fetch(finalsFolder).then(res => res.ok ? res.json() : [])
    ])
    .then(results => {
        const files1 = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
        const files2 = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
        
        const allFiles = [...files1, ...files2];
        const mdFiles = allFiles.filter(f => f.name && f.name.endsWith('.md'));

        if (mdFiles.length === 0) {
            renderMessage("No published projects found.");
            return [];
        }

        const fetchPromises = mdFiles.map(file =>
            fetch(file.download_url)
                .then(res => res.text())
                .then(text => parseMarkdownFrontMatter(text))
                .catch(err => {
                    console.error("Failed to load project file:", err);
                    return null;
                })
        );

        return Promise.all(fetchPromises);
    })
    .then(projects => {
        if (projects) {
            const validProjects = projects.filter(p => p !== null);
            allProjects = validProjects.sort((a, b) => {
                const dateA = a.rawDate ? new Date(a.rawDate) : 0;
                const dateB = b.rawDate ? new Date(b.rawDate) : 0;
                return dateB - dateA;
            });
            filteredProjects = [...allProjects];
            resetAndRender();
        }
    })
    .catch(err => {
        console.error("Error loading projects:", err);
        renderMessage(`Error loading projects: ${err.message}`);
    });
}

function parseMarkdownFrontMatter(text) {
    const getField = (field) => {
        const regex = new RegExp(`${field}:\\s*["']?(.*?)["']?\\s*$`, 'm');
        const match = text.match(regex);
        return match ? match[1].trim() : "";
    };

    const parts = text.split('---');
    let bodyContent = parts.length >= 3 ? parts.slice(2).join('---').trim() : "";

    // Dynamic Base URL resolving from username & repo parameters
    const baseUrl = `https://${username.toLowerCase()}.github.io/${repo}`;

    const formatAssetPath = (path) => {
        if (!path) return "";
        let cleanPath = path.startsWith('/') ? path.substring(1) : path;
        return cleanPath.startsWith('http') ? cleanPath : `${baseUrl}/${cleanPath}`;
    };

    const imagePath = formatAssetPath(getField("image"));
    const pdfPath = formatAssetPath(getField("pdf"));
    const pdfCoverPath = formatAssetPath(getField("pdf_cover"));
    const model3dPath = formatAssetPath(getField("model_3d"));
    const modelCoverPath = formatAssetPath(getField("model_cover"));
    const interactiveUrl = formatAssetPath(getField("interactive_url"));
    const interactiveCoverPath = formatAssetPath(getField("interactive_cover"));

    const rawDate = getField("date");
    const yearOnly = rawDate ? rawDate.substring(0, 4) : "";
    
    return {
        title: getField("title") || "Untitled Project",
        author: getField("author") || "",
        rawDate: rawDate,
        date: yearOnly,
        category: getField("category") || "Uncategorized",
        finalsType: getField("finals_type") || "",
        image: imagePath,
        video: getField("video") || "",
        pdf: pdfPath,
        pdfCover: pdfCoverPath,
        model3d: model3dPath,
        modelCover: modelCoverPath,
        interactiveUrl: interactiveUrl,
        interactiveCover: interactiveCoverPath,
        excerpt: getField("excerpt") || "",
        body: bodyContent
    };
}

/* Video Card Helper: Supports YouTube Lightbox & Direct Player Embeds with Umami Event Tracking */
function renderVideoEmbed(url, coverImgUrl, title, projectSlug) {
    if (!url) return "";

    const youtubeMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    
    if (youtubeMatch) {
        const videoId = youtubeMatch[1];
        const previewImage = coverImgUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;

        return `
            <div class="image-container">
                <a href="${embedUrl}" data-fancybox="${projectSlug}" data-type="iframe" data-caption="${title}"
                   data-umami-event="Play YouTube Video"
                   data-umami-event-title="${title}">
                    <img src="${previewImage}" alt="${title}" loading="lazy">
                    <span class="badge-3d" style="background: rgba(204, 0, 0, 0.85);">▶ Play Video</span>
                </a>
            </div>`;
    }

    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
    if (vimeoMatch) {
        return `
            <div class="video-container">
                <iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" 
                        frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
            </div>`;
    }

    if (url.match(/\.(mp4|webm|ogg)$/i)) {
        return `
            <div class="video-container">
                <video controls preload="metadata" style="width:100%; height:100%; border-radius:4px; object-fit: cover;">
                    <source src="${url}">
                    Your browser does not support HTML5 video.
                </video>
            </div>`;
    }

    return "";
}

/* Render PDF Card for Grid and Launch Fancybox Lightbox on Click */
function renderPdfThumbnail(pdfUrl, coverImgUrl, title, index) {
    if (!pdfUrl) return "";

    const projectSlug = slugify(title);

    if (coverImgUrl) {
        return `
            <div class="image-container">
                <a href="${pdfUrl}" data-fancybox="${projectSlug}" data-type="pdf" data-caption="${title}"
                   data-umami-event="View PDF Document"
                   data-umami-event-title="${title}">
                    <img src="${coverImgUrl}" alt="${title}" loading="lazy">
                    <span class="badge-3d" style="background: rgba(0, 102, 204, 0.85);">📄 View PDF</span>
                </a>
            </div>`;
    }

    return `
        <div class="image-container pdf-card-wrapper">
            <a href="${pdfUrl}" data-fancybox="${projectSlug}" data-type="pdf" data-caption="${title}" class="pdf-card-link"
               data-umami-event="View PDF Document"
               data-umami-event-title="${title}">
                <div class="pdf-card-icon">📄</div>
                <div class="pdf-card-title">${title}</div>
                <span class="pdf-card-btn">Click to View Document</span>
            </a>
        </div>`;
}

function render3DModelCard(modelUrl, coverImgUrl, title, index) {
    if (!modelUrl) return "";

    const previewImage = coverImgUrl || 'images/default-3d-cover.png';
    const projectSlug = slugify(title);

    const modelHTML = `
        <div class="fancybox-3d-wrapper">
            <model-viewer src="${modelUrl}" alt="${title}" camera-controls auto-rotate shadow-intensity="1" bounds="tight" style="width:100%; height:100%;"></model-viewer>
        </div>`;

    return `
        <div class="image-container">
            <a href="javascript:;" data-fancybox="${projectSlug}" data-type="html" data-src='${modelHTML}' data-caption="${title}"
               data-umami-event="View 3D Model"
               data-umami-event-title="${title}">
                <img src="${previewImage}" alt="${title}" loading="lazy">
                <span class="badge-3d">📦 3D Model</span>
            </a>
        </div>`;
}

function renderInteractiveCard(interactiveUrl, coverImgUrl, title) {
    if (!interactiveUrl) return "";

    const previewImage = coverImgUrl || 'images/default-interactive-cover.png';

    return `
        <div class="image-container">
            <a href="${interactiveUrl}" target="_blank" rel="noopener noreferrer" 
               data-caption="${title}"
               data-umami-event="Play Interactive Web Game"
               data-umami-event-title="${title}">
                <img src="${previewImage}" alt="${title}" loading="lazy">
                <span class="badge-interactive">🌐 Interactive Web</span>
            </a>
        </div>`;
}

function resetAndRender() {
    const grid = document.getElementById('portfolio-grid');
    if (!grid) return;
    grid.innerHTML = '';
    visibleCount = 0;

    if (filteredProjects.length === 0) {
        renderMessage("No projects in this category.");
        return;
    }

    loadMoreProjects(INITIAL_LOAD);
}

function loadMoreProjects(countToLoad) {
    if (isLoading) return;
    isLoading = true;

    const grid = document.getElementById('portfolio-grid');
    if (!grid) {
        isLoading = false;
        return;
    }

    const nextBatch = filteredProjects.slice(visibleCount, visibleCount + countToLoad);

    nextBatch.forEach((project) => {
        const index = visibleCount;
        const projectSlug = slugify(project.title);
        const card = document.createElement('div');
        card.className = 'project-card';
        
        const metaParts = [];
        if (project.author) metaParts.push(project.author);

        if (project.category === "Finals" && project.finalsType) {
            metaParts.push(`Finals (${project.finalsType})`);
        } else if (project.category) {
            metaParts.push(project.category);
        }

        if (project.date) metaParts.push(project.date);
        const metaText = metaParts.join(" • ");

        let mediaHTML = "";
        // Priority order: Interactive Web > 3D Model > Video > Image > PDF
        if (project.interactiveUrl) {
            mediaHTML = renderInteractiveCard(project.interactiveUrl, project.interactiveCover || project.image, project.title);
        } else if (project.model3d) {
            mediaHTML = render3DModelCard(project.model3d, project.modelCover || project.image, project.title, index);
        } else if (project.video) {
            mediaHTML = renderVideoEmbed(project.video, project.image, project.title, projectSlug);
        } else if (project.image) {
            mediaHTML = `
                <div class="image-container">
                    <a href="${project.image}" data-fancybox="${projectSlug}" data-caption="${project.title}">
                        <img src="${project.image}" alt="${project.title}" loading="lazy">
                    </a>
                </div>`;
        } else if (project.pdf) {
            mediaHTML = renderPdfThumbnail(project.pdf, project.pdfCover, project.title, index);
        }

        card.innerHTML = `
            ${mediaHTML}
            
            <div class="card-content">
                <div class="meta">${metaText}</div>
                <h2 class="project-title">${project.title}</h2>
                ${project.excerpt ? `<p class="excerpt">${project.excerpt}</p>` : ''}
            </div>

            ${project.pdf && (project.image || project.video || project.model3d || project.interactiveUrl) ? `
                <a href="${project.pdf}" data-fancybox="${projectSlug}" data-type="pdf" data-caption="${project.title}" 
                   data-umami-event="View Attached PDF" 
                   data-umami-event-title="${project.title}" 
                   class="pdf-link-btn">📄 View Attached PDF</a>
            ` : ''}
            
            ${project.body ? `
                <button class="toggle-btn" onclick="toggleDetails(${index})">Read Full Details</button>
                <div id="details-${index}" class="full-details" style="display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;">
                    ${formatMarkdownBody(project.body)}
                </div>
            ` : ''}
        `;
        grid.appendChild(card);
        visibleCount++;
    });

    isLoading = false;
    updateSentinel();
}

function setupIntersectionObserver() {
    if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && visibleCount < filteredProjects.length && !isLoading) {
                    loadMoreProjects(BATCH_LOAD);
                }
            });
        }, {
            rootMargin: '50px'
        });
    }
}

function updateSentinel() {
    let sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) {
        if (observer) observer.unobserve(sentinel);
        sentinel.remove();
    }

    if (visibleCount < filteredProjects.length) {
        sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '20px';
        sentinel.style.width = '100%';
        sentinel.style.clear = 'both';

        const grid = document.getElementById('portfolio-grid');
        if (grid && grid.parentNode) {
            grid.parentNode.insertBefore(sentinel, grid.nextSibling);
            if (observer) observer.observe(sentinel);
        }
    }
}

function toggleDetails(index) {
    const detailsDiv = document.getElementById(`details-${index}`);
    if (!detailsDiv) return;
    const btn = detailsDiv.previousElementSibling;
    
    if (detailsDiv.style.display === "none") {
        detailsDiv.style.display = "block";
        btn.innerText = "Hide Details";
    } else {
        detailsDiv.style.display = "none";
        btn.innerText = "Read Full Details";
    }
}

function formatMarkdownBody(bodyText) {
    if (!bodyText) return "";

    return bodyText
        .replace(/\[([^\]]+)\]\((https?:\r?\n?[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="project-link">$1</a>')
        .replace(/(^|[^"'])((https?:\/\/[^\s<]+))/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="project-link">$2</a>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

function filterProjects(category, btnElement) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const catUpper = category.toUpperCase();

    if (catUpper === 'ALL') {
        filteredProjects = [...allProjects];
    } else if (catUpper === 'FINALS') {
        filteredProjects = allProjects.filter(p => p.category.toUpperCase() === 'FINALS');
    } else {
        filteredProjects = allProjects.filter(p => {
            const mainCatMatches = p.category.toUpperCase().includes(catUpper);
            const finalsSubMatches = p.category.toUpperCase() === 'FINALS' && p.finalsType.toUpperCase() === catUpper;
            return mainCatMatches || finalsSubMatches;
        });
    }

    resetAndRender();
}

function renderMessage(message) {
    const grid = document.getElementById('portfolio-grid');
    if (grid) {
        grid.innerHTML = `<p class="loading-text">${message}</p>`;
    }
}
