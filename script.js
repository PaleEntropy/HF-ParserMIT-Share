// ==UserScript==
// @name         HF-To-Excel
// @namespace    http://tampermonkey.net/
// @version      0.95
// @description  Extract data from links and save to Excel
// @author       Avito Market Intelligence HR Team
// @match        *://[INSERT].huntflow.ru/*
// @updateURL    https://github.com/PaleEntropy/HF-ParserMIT-Share/blob/main/script.js
// @downloadURL  https://github.com/PaleEntropy/HF-ParserMIT-Share/blob/main/script.js
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('HF_SE: Script started');

    let buttonAdded = false;

    function addButton() {
        if (buttonAdded) {
            return;
        }
        var buttonContainer = document.querySelector('div.title--dUJju[data-qa="vacancy-block"]');
        if (buttonContainer) {
            console.log('HF_SE: Button container found:', buttonContainer);

            var newButton = document.createElement('div');
            newButton.className = 'item--OBfF8';
            newButton.innerHTML = '<a><span style="padding: 5px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">to Excel</span></a>';

            newButton.querySelector('a').addEventListener('click', async function() {
                console.log('HF_SE: Button clicked');
                var applicantRootElements = document.querySelectorAll('div[data-qa="applicant_root"]');
                var elements = [];
                applicantRootElements.forEach(el => {
                    var linkElement = el.querySelector('a[data-qa="applicant"]');
                    if (linkElement) {
                        elements.push(linkElement);
                    }
                });
                var count = elements.length;
                console.log(`HF_SE: Found ${count} elements with data-qa="applicant_root" and a[data-qa="applicant"]`);
                var numberToLoad = prompt(`Найдено ${count} элементов. Сколько из них загрузить?`, count);

                if (numberToLoad !== null && !isNaN(numberToLoad)) {
                    numberToLoad = Math.min(count, parseInt(numberToLoad));
                    await loadPagesAndExtractData(elements, numberToLoad);
                }
            });

            buttonContainer.appendChild(newButton);
            buttonAdded = true;
            console.log('HF_SE: Button added to the container');
        } else {
            console.log('HF_SE: Button container not found');
        }
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length || mutation.removedNodes.length) {
                console.log('HF_SE: DOM changed');
                addButton();
            }
        });
    });

    const targetNode = document.querySelector('body');
    observer.observe(targetNode, { childList: true, subtree: true });

    setTimeout(addButton, 3000);

    async function clickElementAndWaitForLoad(element) {
    return new Promise((resolve) => {
        element.click();
        var checkExist = setInterval(function() {
            var titleElement = document.querySelector('h1[data-qa="applicant-card-title"]');
            if (titleElement) {
                clearInterval(checkExist);
                setTimeout(() => {
                    resolve();
                }, 2000);
            }
        }, 1000);
    });
}

async function loadPagesAndExtractData(elements, numberToLoad) {
    var data = [];
    for (var i = 0; i < numberToLoad; i++) {
        var element = elements[i];
        window.firstAddedDate = 'N/A'; // Reset the date before processing a new page
        await clickElementAndWaitForLoad(element);
        await handleAllShowMoreVacancies(); // Ensure the Personal Notes section is open
        await handleAllVacanciesLoadMore();
        await ensurePersonalNotesOpen(); // Ensure the Personal Notes section is open
        const extractedData = await extractDataWithComments(document);
        data.push(extractedData);
        await navigateBack();
    }

    console.log('HF_SE: Data loaded from all pages');
    generateExcel(data);
}

async function handleAllShowMoreVacancies() {
    console.log('HF_SE: Checking for all "Show more vacancies" buttons...');

    let showMoreButtons;

    // Loop until no more "Show more vacancies" buttons are found
    do {
        // Find all visible "Show more vacancies" buttons
        showMoreButtons = Array.from(
            document.querySelectorAll('div.buttonWrapper--vI9D1.moreButton--p39xA > button')
        ).filter(button => button.offsetParent !== null); // Filter to only visible buttons

        console.log(`HF_SE: Found ${showMoreButtons.length} "Show more vacancies" buttons.`);

        for (const button of showMoreButtons) {
            console.log('HF_SE: Clicking "Show more vacancies" button:', button.outerHTML);
            button.click();

            // Wait briefly for the new vacancies to load
            console.log('HF_SE: Waiting for vacancies to load after clicking "Show more vacancies"...');
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Adjust delay if needed
        }

        // Wait briefly before rechecking for new buttons
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Adjust delay if needed
    } while (showMoreButtons.length > 0);

    console.log('HF_SE: No more "Show more vacancies" buttons found.');
}





async function handleAllVacanciesLoadMore() {
    console.log('HF_SE: Looking for all vacancies on the page...');

    // Select all vacancies, including both relevant and irrelevant ones
    const allVacancies = document.querySelectorAll('li[class*="root--GhuQk"]');
    if (allVacancies.length === 0) {
        console.error('HF_SE: No vacancies found on the page.');
        return; // Exit if no vacancies are found
    }

    console.log(`HF_SE: Found ${allVacancies.length} vacancies on the page.`);

    // Parallelize vacancy processing
    await Promise.all(
        Array.from(allVacancies).map(async (vacancy, index) => {
            console.log(`HF_SE: Processing vacancy ${index + 1} of ${allVacancies.length}.`);
            console.log('HF_SE: Vacancy content:', vacancy.outerHTML);

            async function clickAllLoadMoreButtonsInVacancy() {
                let loadMoreButtons;

                do {
                    // Find all visible "Load more" buttons in the current vacancy
                    loadMoreButtons = vacancy.querySelectorAll('div.moreButton--JZye3 > button');
                    console.log(`HF_SE: Found ${loadMoreButtons.length} "Load more" buttons in vacancy ${index + 1}.`);

                    // Log details of all buttons found
                    loadMoreButtons.forEach((button, btnIndex) => {
                        console.log(`HF_SE: Button ${btnIndex + 1} in vacancy ${index + 1}:`, button.outerHTML);
                    });

                    await Promise.all(
                        Array.from(loadMoreButtons).map(async (button) => {
                            if (button.offsetParent === null) {
                                console.warn('HF_SE: Skipping hidden "Load more" button:', button.outerHTML);
                                return;
                            }

                            console.log(`HF_SE: Clicking a "Load more" button in vacancy ${index + 1}:`, button.outerHTML);
                            button.click();

                            // Wait briefly for content to load after clicking
                            await new Promise((resolve) => setTimeout(resolve, 500)); // Reduced delay
                        })
                    );

                    // Wait briefly before re-checking for new buttons
                    console.log('HF_SE: Re-checking for new "Load more" buttons...');
                    await new Promise((resolve) => setTimeout(resolve, 500)); // Reduced delay
                } while (loadMoreButtons.length > 0);

                console.log(`HF_SE: No more "Load more" buttons left in vacancy ${index + 1}.`);
            }

            await clickAllLoadMoreButtonsInVacancy();
        })
    );

    console.log('HF_SE: All "Load more" clicks completed for all vacancies.');
}














async function ensurePersonalNotesOpen() {
    // Open the Personal Notes tab if it exists
    const personalNotesTab = document.querySelector('a#tab-note');
    if (personalNotesTab) {
        personalNotesTab.click();
        console.log('HF_SE: Personal Notes tab clicked');
    } else {
        console.error('HF_SE: Personal Notes tab not found');
        return; // Exit if the tab is not available
    }

    // Function to click "Load more" buttons in a cycle until none are left
    async function clickAllLoadMoreButtons() {
        console.log('HF_SE: Looking for Personal Notes section...');
        const personalNotesSection = document.querySelector('div[data-qa="applicant_comments"]');
        if (personalNotesSection) {
            console.log('HF_SE: Personal Notes section found.');

            let loadMoreButtons;
            do {
                // Find all visible "Load more" buttons in the section
                loadMoreButtons = personalNotesSection.querySelectorAll('div.moreButton--JZye3 > button');
                console.log(`HF_SE: Found ${loadMoreButtons.length} "Load more" buttons.`);

                for (const button of loadMoreButtons) {
                    console.log('HF_SE: Clicking a "Load more" button:', button.outerHTML);
                    button.click();

                    // Wait for content to load after clicking
                    console.log('HF_SE: Waiting for content to load...');
                    await new Promise((resolve) => setTimeout(resolve, 2000)); // Adjust delay if needed
                }

                // Wait briefly before re-checking for new buttons
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } while (loadMoreButtons.length > 0);

            console.log('HF_SE: No more "Load more" buttons left.');
        } else {
            console.error('HF_SE: Personal Notes section not found.');
        }
    }

    // Wait for a short delay to ensure content is ready, then start clicking "Load more"
    console.log('HF_SE: Waiting for 3 seconds before looking for "Load more" buttons...');
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds for the content to load
    await clickAllLoadMoreButtons();

    console.log('HF_SE: All "Load more" clicks completed or no buttons found.');
}












async function extractDataWithComments(doc) {
    // Open comments in all vacancies first
    await openVacancyComments();

    // Now extract the data after ensuring all comments are visible
    return extractData(doc);
}


async function openVacancyComments() {
    var vacancyItems = document.querySelectorAll('li[data-qa="applicant_vacancy"]');
    console.log('HF_SE: Number of vacancies found:', vacancyItems.length);

    for (var i = 0; i < vacancyItems.length; i++) {
        var vacancyItem = vacancyItems[i];

        // Click "Show more" in the current vacancy if available
        var showMoreButton = vacancyItem.querySelector('button.moreButton--JZye3');
        if (showMoreButton) {
            showMoreButton.click();
            console.log(`HF_SE: "Show more" clicked in vacancy ${i + 1}`);
            await new Promise(resolve => setTimeout(resolve, 1000));  // Wait for content to load
        }

        // Click "Load more" if available within the current vacancy
        async function clickLoadMoreInVacancy(vacancy) {
            var loadMoreButton = vacancy.querySelector('div.buttons--xJ9TV button.moreButton--JZye3');
            if (loadMoreButton) {
                loadMoreButton.click();
                console.log(`HF_SE: "Load more" clicked in vacancy ${i + 1}`);
                await new Promise(resolve => setTimeout(resolve, 1000));  // Wait for content to load
                await clickLoadMoreInVacancy(vacancy);  // Recursively click "Load more" until no button is found
            }
        }

        await clickLoadMoreInVacancy(vacancyItem);
    }
}




    function navigateBack() {
        return new Promise((resolve) => {
            window.history.back();
            var checkExist = setInterval(function() {
                var applicantListElement = document.querySelector('div[data-qa="applicant_root"]');
                if (applicantListElement) {
                    clearInterval(checkExist);
                    setTimeout(() => {
                        resolve();
                    }, 1000);
                }
            }, 500);
        });
    }

function checkForOfferInComments() {
    var logItems = document.querySelectorAll('div.comment--WsYTn');

    console.log('HF_SE: Number of comment items found:', logItems.length);

    for (var i = 0; i < logItems.length; i++) {
        var logItem = logItems[i];
        var textContent = logItem.innerText.trim();

        console.log(`HF_SE: Checking comment item ${i + 1}:`, textContent);

        if (textContent.includes("оффер") || textContent.includes("Оффер")) {
            console.log('HF_SE: "оффер" or "Оффер" found in comment item:', i + 1);
            return 'Yes';
        }
    }

    console.log('HF_SE: No "оффер" or "Оффер" found in any comment.');
    return 'No';
}


function extractAddedBy(doc) {
    var logItems = doc.querySelectorAll('div[data-qa="log_item"]'); // Updated selector

    console.log('HF_SE: Number of log items found:', logItems.length);

    // Loop through the log items in reverse order to find the last (chronologically first) "Applicant added" text
    for (var i = logItems.length - 1; i >= 0; i--) {
        var logItem = logItems[i];
        var textContent = logItem.innerText.trim();

        console.log(`HF_SE: Checking log item ${i + 1}:`, textContent);

        if (textContent.includes("Applicant added")) {
            console.log('HF_SE: "Applicant added" found in log item:', i + 1);

            // Updated selectors to extract username and date
            var nameElement = logItem.querySelector('span.username--iip9n');
            var dateElement = logItem.querySelector('span[title]');

            if (nameElement && dateElement) {
                console.log('HF_SE: Name found:', nameElement.innerText.trim());
                console.log('HF_SE: Date found:', dateElement.getAttribute('title'));
                window.firstAddedDate = dateElement.getAttribute('title'); // Store the date globally
                return nameElement.innerText.trim(); // Return the name
            } else {
                console.log('HF_SE: Name or date element not found.');
            }
        }
    }

    console.log('HF_SE: No "Applicant added" entry found.');
    return 'N/A';
}


function extractAddedDate() {
    return window.firstAddedDate || 'N/A';
}


    function extractTakenOn(doc) {
    var vacancyItems = doc.querySelectorAll('li[data-qa="applicant_vacancy"]');
    console.log('HF_SE: Number of vacancies found:', vacancyItems.length);
    return vacancyItems.length >= 2 ? 'Yes' : 'No';
}










function extractTakenBy(doc) {
    // Find all instances of the "Added to the Vacancy" text
    var logItems = doc.querySelectorAll('div[data-qa="log_item"]');

    // We want the first chronologically (appearing in natural order)
    for (var i = 0; i < logItems.length; i++) {
        var logItem = logItems[i];

        // Check if this log item contains the "Added to the Vacancy" text
        if (logItem.innerText.includes("Added to the Vacancy")) {
            // Find the username in the closest element with class "username--iip9n"
            var usernameElement = logItem.querySelector('span.username--iip9n');
            if (usernameElement) {
                return usernameElement.innerText.trim(); // Return the name
            }
        }
    }

    return 'N/A'; // Return 'N/A' if no relevant log entry was found
}


function extractTakenLater(doc) {
    // Find all log items on the page
    var allLogItems = doc.querySelectorAll('div[data-qa="log_item"]');
    var mainDate = null;
    var takenLater = false;

    // Iterate through each log item to find the "Added to the Vacancy" entry for the current vacancy
    allLogItems.forEach((logItem, index) => {
        // Check if the log item contains "Added to the Vacancy"
        var commentText = logItem.querySelector('.comment--WsYTn');
        if (commentText && commentText.innerText.includes("Added to the Vacancy")) {
            var dateElement = logItem.querySelector('span[title]');
            if (dateElement) {
                var dateStr = dateElement.getAttribute('title');
                var parsedDate = new Date(dateStr);

                // If we haven't set the main date yet, this is our current vacancy date
                if (!mainDate) {
                    mainDate = parsedDate;
                    console.log(`HF_SE: Main date found: ${dateStr}`);
                } else {
                    // Compare other dates with the main date
                    console.log(`HF_SE: Date extracted for comparison: ${dateStr}`);
                    if (parsedDate > mainDate) {
                        takenLater = true;
                        console.log(`HF_SE: Candidate was added to another vacancy later.`);
                    }
                }
            }
        }
    });

    if (!mainDate) {
        console.log('HF_SE: No main date found for the current vacancy.');
        return 'No';
    }

    return takenLater ? 'Yes' : 'No';
}

















function extractData(doc) {
    var titleElement = doc.querySelector('h1[data-qa="applicant-card-title"]');
    var titleText = titleElement ? titleElement.innerText.trim() : 'N/A';

    var positionElement = doc.querySelector('div.position--dSSdW');
    var positionText = positionElement ? positionElement.innerText.split('•')[0].trim() : 'N/A'; // Extract only the position part

    var telegramText = extractTelegram(doc);
    var phoneNumberText = extractPhoneNumber(doc);
    var emailText = extractEmail(doc);
    var linkedInText = extractLinkedIn(doc);
    var companyText = extractCompany(doc);
    var comments = extractComment(doc); // Extract both comments
    var addedByText = extractAddedBy(doc); // Extract the name of the person who added the applicant
    var addedDateText = extractAddedDate(doc); // Extract the date and time when the applicant was added
    var takenOnText = extractTakenOn(doc); // Determine if the candidate is taken on at least 2 vacancies
    var wasOfferedText = checkForOfferInComments(doc); // Check if the candidate was offered a position
    var takenByText = extractTakenBy(doc);
    var takenLaterText = extractTakenLater(doc); // New function for taken_later

    var url = window.location.href;

    return {
        'applicant-card-title': titleText,
        'position_title': positionText, // Updated extraction logic for title
        'telegram': telegramText,
        'phone_number': phoneNumberText,
        'email': emailText,
        'linkedin': linkedInText,
        'company': companyText,
        'last_comment': comments.lastComment, // Include the last comment
        'second_last_comment': comments.secondLastComment, // Include the second last comment
        'added_by': addedByText, // Include the added_by field in the final data
        'added_date': addedDateText, // Include the added_date field in the final data
        'taken_on': takenOnText, // Include the taken_on field in the final data
        'was_offered': wasOfferedText, // Include the was_offered field in the final data
        'taken_by': takenByText,
        'taken_later': takenLaterText, // Include the taken_later logic result
        'url': url
    };
}






function extractCompany(doc) {
    // Locate the 'position--dSSdW' element
    const positionElement = doc.querySelector('div.position--dSSdW');

    if (positionElement) {
        // Find the span containing the delimiter
        const delimiterSpan = positionElement.querySelector('span.delimiter--idiKd');
        if (delimiterSpan) {
            // Get the next sibling node after the delimiter span
            const companySpan = delimiterSpan.nextSibling;
            if (companySpan && companySpan.nodeType === Node.TEXT_NODE) {
                return companySpan.textContent.trim(); // Extract and return the company name
            }
        }
    }
    return 'N/A'; // Default to 'N/A' if extraction fails
}













function extractTelegram(doc) {
    // Locate the correct button specifically under the table structure
    const telegramButton = doc.querySelector(
        'dl.table--rwQnD dd.dd--vtf8C div.referenceWrapper--vGCKI > button.button--OyRVi.buttonText--tamFM'
    );

    if (telegramButton) {
        const telegramText = telegramButton.innerText.trim(); // Extract the exact button text
        console.log('HF_SE: Telegram extracted:', telegramText);
        return telegramText;
    }

    console.log('HF_SE: Telegram button not found or incorrect button selected.');
    return 'N/A'; // Return 'N/A' if the correct button is not found
}







    function extractPhoneNumber(doc) {
        var phoneElement = doc.querySelector('a[href^="tel:"]');
        return phoneElement ? phoneElement.innerText.trim() : 'N/A';
    }

    function extractEmail(doc) {
        var emailElement = doc.querySelector('a[href^="mailto:"]');
        return emailElement ? emailElement.innerText.trim() : 'N/A';
    }

    function extractLinkedIn(doc) {
        var linkedInElement = doc.querySelector('a[href*="linkedin.com"]');
        return linkedInElement ? linkedInElement.href : 'N/A';
    }


function extractComment(doc) {
    // Select all comment spans within the log items
    var logItems = doc.querySelectorAll('div[data-qa="log_items"] div[data-qa="log_item"] div[class*="comment"] span');

    // Log the number of comments found
    console.log('HF_SE: Number of comment spans found:', logItems.length);

    // Log each comment for debugging
    logItems.forEach((item, index) => {
        console.log(`HF_SE: Comment ${index + 1}:`, item.innerText.trim());
    });

    // Initialize variables to store the last and second-last comments
    var lastCommentText = 'N/A';
    var secondLastCommentText = 'N/A';

    // If there is at least one comment, get the last one
    if (logItems.length > 0) {
        lastCommentText = logItems[0].innerText.trim();
    }

    // If there are at least two comments, get the second-last one
    if (logItems.length > 1) {
        secondLastCommentText = logItems[1].innerText.trim();
    }

    // Log the extracted comments
    console.log('HF_SE: Last comment extracted:', lastCommentText);
    console.log('HF_SE: Second last comment extracted:', secondLastCommentText);

    // Return an object containing both comments
    return {
        lastComment: lastCommentText,
        secondLastComment: secondLastCommentText
    };
}









    function generateExcel(data) {
        var ws = XLSX.utils.json_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, "data.xlsx");
        console.log('HF_SE: Excel file generated');
    }

})();
