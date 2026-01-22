(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKBoPih3bSOhHQH42lkPiG4hSQ6BpFerB-afEeIwlIej2f-Rk7WzV019hqzsV1f0IJhgWmlfZLj68u/pub?gid=241242125&single=true&output=csv',
    cacheKey: 'nextava_widget_cache',
    cacheDuration: 5 * 60 * 1000, // 5 minutes in milliseconds
    modalities: {
      'XRAY_AVA': 'X-Ray',
      'US_AVA': 'Ultrasound',
      'VUS_AVA': 'Vascular Ultrasound',
      'BMD_AVA': 'Bone Density Scan',
      'MAMMO_AVA': 'Mammogram'
    }
  };

  // Get widget parameters from script tag
  const script = document.currentScript;
  const clinicId = script.getAttribute('data-clinic-id');
  const hideBranding = script.getAttribute('data-branding') === 'hide';
  const customColor = script.getAttribute('data-color') || '#059669'; // Default green
  const showUpdated = script.getAttribute('data-show-updated') === 'true';

  if (!clinicId) {
    console.error('NextAva Widget: data-clinic-id attribute is required');
    return;
  }

  // Simple CSV parser (handles quoted fields with commas)
  function parseCSV(text) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentLine.push(currentField);
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n in \r\n
        }
        if (currentField || currentLine.length > 0) {
          currentLine.push(currentField);
          lines.push(currentLine);
          currentLine = [];
          currentField = '';
        }
      } else {
        currentField += char;
      }
    }

    // Push last field and line if exists
    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField);
      lines.push(currentLine);
    }

    return lines;
  }

  // Get data from cache or fetch fresh
  function getData() {
    return new Promise((resolve, reject) => {
      const cached = localStorage.getItem(CONFIG.cacheKey);
      
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        if (age < CONFIG.cacheDuration) {
          return resolve({ data, timestamp });
        }
      }

      // Fetch fresh data
      fetch(CONFIG.csvUrl)
        .then(response => {
          if (!response.ok) throw new Error('Failed to fetch data');
          return response.text();
        })
        .then(csvText => {
          const rows = parseCSV(csvText);
          const timestamp = Date.now();
          
          // Cache the data
          try {
            localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
              data: rows,
              timestamp: timestamp
            }));
          } catch (e) {
            // Storage quota exceeded or disabled - continue without caching
            console.warn('NextAva Widget: Could not cache data');
          }
          
          resolve({ data: rows, timestamp });
        })
        .catch(reject);
    });
  }

  // Format time since last update from AVA_TIMESTAMP
  function timeAgo(timestampString) {
    if (!timestampString || timestampString.trim() === '') {
      return null;
    }
    
    try {
      const lastUpdated = new Date(timestampString);
      
      // Check if date is valid
      if (isNaN(lastUpdated.getTime())) {
        return null;
      }
      
      // Check for future dates (clock skew)
      if (lastUpdated > new Date()) {
        return 'recently';
      }
      
      const daysSince = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince === 0) return 'today';
      if (daysSince === 1) return 'yesterday';
      if (daysSince < 7) return `${daysSince} days ago`;
      
      const weeksSince = Math.floor(daysSince / 7);
      if (weeksSince === 1) return '1 week ago';
      if (weeksSince === 2) return '2 weeks ago';
      if (weeksSince >= 3) return '3+ weeks ago';
      
      return `${daysSince} days ago`;
    } catch (e) {
      return null;
    }
  }

  // Find clinic data by ID
  function findClinic(rows, clinicId) {
    if (rows.length < 2) return null;
    
    const headers = rows[0];
    const clinicIdColIndex = headers.findIndex(h => 
      h && h.trim().toLowerCase() === 'clinicid'
    );

    if (clinicIdColIndex === -1) {
      console.error('NextAva Widget: ClinicID column not found in spreadsheet');
      return null;
    }

    // Find the clinic row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[clinicIdColIndex] && row[clinicIdColIndex].trim() === clinicId) {
        // Build object with header keys
        const clinic = {};
        headers.forEach((header, index) => {
          clinic[header] = row[index] || '';
        });
        return clinic;
      }
    }

    return null;
  }

  // Render the widget
  function render(clinic, cacheTimestamp) {
    const container = document.getElementById('nextava-widget');
    if (!container) {
      console.error('NextAva Widget: Element with id "nextava-widget" not found');
      return;
    }

    if (!clinic) {
      container.innerHTML = `
        <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Clinic information not available.</p>
        </div>
      `;
      return;
    }

    // Build availability list
    const availabilities = [];
    Object.keys(CONFIG.modalities).forEach(key => {
      const value = clinic[key];
      if (value && value.trim()) {
        availabilities.push({
          name: CONFIG.modalities[key],
          availability: value.trim()
        });
      }
    });

    if (availabilities.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">No availability information available at this time.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div style="padding: 20px; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #111827;">Current Availability</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
    `;

    availabilities.forEach(item => {
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
          <span style="font-size: 14px; color: #374151; font-weight: 500;">${item.name}:</span>
          <span style="font-size: 14px; color: ${customColor}; font-weight: 600;">${item.availability}</span>
        </div>
      `;
    });

    html += `</div>`;

    // Add notes if present
    const notes = clinic['NOTES_AVA'];
    if (notes && notes.trim()) {
      html += `
        <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
          <p style="margin: 0; font-size: 13px; color: #78350f;"><strong>Note:</strong> ${notes.trim()}</p>
        </div>
      `;
    }

    // Add last updated timestamp if enabled
    if (showUpdated) {
      const avaTimestamp = clinic['AVA_TIMESTAMP'];
      const formattedTime = timeAgo(avaTimestamp);
      
      if (formattedTime) {
        html += `
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #f3f4f6;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Updated ${formattedTime}</p>
          </div>
        `;
      }
    }

    // Add branding
    if (!hideBranding) {
      html += `
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #f3f4f6; text-align: center;">
          <a href="https://nextavahealth.com" target="_blank" rel="noopener" style="font-size: 12px; color: #6b7280; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            <span>Powered by</span>
            <span style="color: ${customColor}; font-weight: 600;">NextAva Health</span>
          </a>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  // Show loading state
  function showLoading() {
    const container = document.getElementById('nextava-widget');
    if (container) {
      container.innerHTML = `
        <div style="padding: 20px; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Loading availability...</p>
        </div>
      `;
    }
  }

  // Show error state
  function showError() {
    const container = document.getElementById('nextava-widget');
    if (container) {
      container.innerHTML = `
        <div style="padding: 16px; border: 1px solid #fca5a5; border-radius: 8px; background: #fef2f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <p style="margin: 0; color: #991b1b; font-size: 14px;">Unable to load availability information. Please try again later.</p>
        </div>
      `;
    }
  }

  // Initialize widget
  function init() {
    showLoading();
    
    getData()
      .then(result => {
        const rows = result.data || result;
        const timestamp = result.timestamp || Date.now();
        const clinic = findClinic(rows, clinicId);
        render(clinic, timestamp);
      })
      .catch(err => {
        console.error('NextAva Widget Error:', err);
        showError();
      });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
