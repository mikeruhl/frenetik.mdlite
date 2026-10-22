# remote-images Specification

## Purpose

Defines the Image Allow-list, the single enforcement point for remote image requests, and the blocked-image placeholder.

## Requirements

### Requirement: Remote images load only from allowed hosts

The system SHALL load a remote image only when its hostname exactly matches an entry in the Image Allow-list or the
exact URL was allowed once in the current session. The Image Allow-list SHALL be empty on first run.

#### Scenario: Host not allowed

- **WHEN** a Document contains `![logo](https://example.com/a.png)` and `example.com` is not on the Image Allow-list
- **THEN** no network request is made to `example.com` and a placeholder is shown instead of the image

#### Scenario: Host allowed

- **WHEN** `example.com` is on the Image Allow-list and a Document references `https://example.com/a.png`
- **THEN** the image is displayed

#### Scenario: Subdomain is not implied

- **WHEN** `example.com` is on the Image Allow-list and a Document references `https://cdn.example.com/a.png`
- **THEN** the image is blocked

### Requirement: All remote image requests pass through one enforcement point

The system SHALL enforce the Image Allow-list outside the webview, and the webview content security policy SHALL NOT
permit direct loading of remote images.

#### Scenario: Direct remote source bypass attempt

- **WHEN** rendered content contains an image element whose source is a remote URL that was not rewritten by the
  renderer
- **THEN** the webview refuses to load it

#### Scenario: Redirect to disallowed host

- **WHEN** an allowed host responds with a redirect to a host that is not allowed
- **THEN** the redirect is not followed and the image is not displayed

#### Scenario: Non-image response

- **WHEN** an allowed URL returns a response whose content type is not an image type
- **THEN** the image is not displayed

### Requirement: Blocked image placeholder

The system SHALL render each blocked image as a placeholder showing its alt text and hostname, with a **Load once**
action and an **Always allow `<host>`** action. The placeholder SHALL be legible in all bundled themes.

#### Scenario: Load once

- **WHEN** the reader activates **Load once** on a placeholder
- **THEN** that image is displayed, the host is not added to the Image Allow-list, and the allowance does not survive an
  app restart

#### Scenario: Always allow host

- **WHEN** the reader activates **Always allow `example.com`**
- **THEN** `example.com` is added to the Image Allow-list, every image from that host in the Document is displayed, and
  the setting persists across restarts
