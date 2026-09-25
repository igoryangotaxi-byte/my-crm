<?php
/**
 * Plugin Name: Appli CRM Form Bridge
 * Description: Sends Elementor form submissions from appli.taxi to Sales Operation CRM (B2B + Drivers Pipeline).
 * Version: 1.2.3
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Persist last bridge attempts for WP admin debugging (no secrets).
 */
function appli_crm_bridge_remember($entry) {
    $key = 'appli_crm_bridge_last_runs';
    $runs = get_option($key, []);
    if (!is_array($runs)) {
        $runs = [];
    }
    array_unshift($runs, array_merge([
        'at' => gmdate('c'),
    ], $entry));
    update_option($key, array_slice($runs, 0, 20), false);
}

/**
 * Shared helper: POST JSON to CRM webhook (one retry on transport error).
 */
function appli_crm_bridge_post_webhook($url, $secret, $payload, $context = []) {
    $args = [
        'timeout' => 20,
        'redirection' => 2,
        'blocking' => true,
        'sslverify' => true,
        'headers' => [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'X-Webhook-Secret' => $secret,
            'User-Agent' => 'AppliCRMBridge/1.2.3',
        ],
        'body' => wp_json_encode($payload, JSON_UNESCAPED_UNICODE),
    ];

    $response = wp_remote_post($url, $args);
    if (is_wp_error($response)) {
        error_log('[Appli CRM Bridge] webhook error: ' . $response->get_error_message());
        // Retry once after short delay.
        usleep(250000);
        $response = wp_remote_post($url, $args);
    }

    if (is_wp_error($response)) {
        $msg = $response->get_error_message();
        error_log('[Appli CRM Bridge] webhook retry failed: ' . $msg);
        appli_crm_bridge_remember([
            'ok' => false,
            'context' => $context,
            'error' => $msg,
            'url' => $url,
            'fullName' => isset($payload['fullName']) ? (string) $payload['fullName'] : '',
        ]);
        return false;
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    $body = (string) wp_remote_retrieve_body($response);
    $ok = ($code >= 200 && $code < 300);
    if (!$ok) {
        error_log('[Appli CRM Bridge] webhook HTTP ' . $code . ' body=' . $body);
    }
    appli_crm_bridge_remember([
        'ok' => $ok,
        'context' => $context,
        'http' => $code,
        'body' => substr($body, 0, 300),
        'url' => $url,
        'fullName' => isset($payload['fullName']) ? (string) $payload['fullName'] : '',
        'submissionId' => isset($payload['submissionId']) ? (string) $payload['submissionId'] : '',
    ]);
    return $ok;
}

/**
 * Core: map Elementor record → CRM.
 */
function appli_crm_bridge_handle_elementor_record($record) {
    if (!is_object($record) || !method_exists($record, 'get_form_settings')) {
        appli_crm_bridge_remember(['ok' => false, 'context' => 'bad_record']);
        return;
    }

    $form_name = (string) $record->get_form_settings('form_name');
    $form_id = '';
    if (isset($_POST['form_id'])) {
        $form_id = sanitize_text_field(wp_unslash((string) $_POST['form_id']));
    }
    $post_id = '';
    if (isset($_POST['post_id'])) {
        $post_id = sanitize_text_field(wp_unslash((string) $_POST['post_id']));
    }

    $raw_fields = $record->get('fields');
    if (!is_array($raw_fields)) {
        $raw_fields = [];
    }

    $get = function ($keys) use ($raw_fields) {
        $asString = function ($value) {
            if (is_array($value)) {
                $parts = [];
                foreach ($value as $item) {
                    if ($item === null || $item === '') {
                        continue;
                    }
                    $parts[] = is_scalar($item) ? (string) $item : '';
                }
                return trim(implode(', ', array_filter($parts, static fn($p) => $p !== '')));
            }
            if ($value === null) {
                return '';
            }
            return trim((string) $value);
        };

        foreach ((array) $keys as $key) {
            if (isset($raw_fields[$key]['value'])) {
                $v = $asString($raw_fields[$key]['value']);
                if ($v !== '') {
                    return $v;
                }
            }
        }
        foreach ($raw_fields as $field) {
            if (!is_array($field)) {
                continue;
            }
            $id = isset($field['id']) ? (string) $field['id'] : '';
            $type = isset($field['type']) ? (string) $field['type'] : '';
            if (in_array($id, (array) $keys, true) || in_array($type, (array) $keys, true)) {
                if (isset($field['value'])) {
                    $v = $asString($field['value']);
                    if ($v !== '') {
                        return $v;
                    }
                }
            }
        }
        return '';
    };

    $full_name = $get(['name', 'fullName', 'full_name']);
    $email = $get(['email']);
    $phone = $get(['phone', 'tel', 'phonenumber', 'field_845eff1']);
    $taxi_license = $get([
        'taxi_license',
        'taxiLicense',
        'field_taxi_license',
        'field_6f4c523',
        'license',
        'רישיון',
    ]);

    if ($full_name === '') {
        appli_crm_bridge_remember([
            'ok' => false,
            'context' => 'empty_name',
            'form_id' => $form_id,
            'form_name' => $form_name,
            'post_id' => $post_id,
            'field_keys' => array_keys($raw_fields),
        ]);
        return;
    }

    // --- Drivers Pipeline form ---
    // Live pages: dedicated form (1179 / 3684f71) + /driver/ landing (189 / bc10c16).
    // Landing form name historically has a leading "1" prefix.
    $driver_names = [
        'טופס הצטרפות למערך הנהגים',
        '1טופס הצטרפות למערך הנהגים',
    ];
    $driver_ids = [
        '3684f71',
        'bc10c16',
    ];
    $driver_post_ids = [
        '1179',
        '189',
    ];

    $driver_name_ok = false;
    $form_name_norm = function_exists('mb_strtolower')
        ? mb_strtolower($form_name)
        : strtolower($form_name);
    // Strip leading digits / whitespace variants ("1טופס…").
    $form_name_stripped = preg_replace('/^\s*\d+/u', '', $form_name_norm);
    foreach ($driver_names as $allowed) {
        $allowed_norm = function_exists('mb_strtolower')
            ? mb_strtolower($allowed)
            : strtolower($allowed);
        if (
            $form_name_norm !== ''
            && ($form_name_norm === $allowed_norm
                || $form_name_stripped === $allowed_norm
                || str_contains($form_name_norm, 'הצטרפות למערך הנהגים'))
        ) {
            $driver_name_ok = true;
            break;
        }
    }
    $driver_id_ok = $form_id !== '' && in_array($form_id, $driver_ids, true);
    $driver_post_ok = $post_id !== '' && in_array($post_id, $driver_post_ids, true);

    if ($driver_name_ok || $driver_id_ok || $driver_post_ok) {
        $stable_form = $form_id !== '' ? $form_id : ($form_name !== '' ? $form_name : $post_id);
        $submission_id = 'elementor-drivers-' . $stable_form . '-' . md5(
            strtolower($email) . '|' . $phone . '|' . $full_name . '|' . gmdate('Y-m-d-H')
        );

        $secret = defined('APPLI_DRIVERS_PIPELINE_WEBHOOK_SECRET')
            ? (string) APPLI_DRIVERS_PIPELINE_WEBHOOK_SECRET
            : (string) get_option('appli_drivers_pipeline_webhook_secret', '');
        $url = defined('APPLI_DRIVERS_PIPELINE_WEBHOOK_URL')
            ? (string) APPLI_DRIVERS_PIPELINE_WEBHOOK_URL
            : 'https://applitaxi.space/api/sales-operation/webhooks/drivers';

        if ($secret === '') {
            error_log('[Appli CRM Bridge] Drivers webhook secret is not configured.');
            appli_crm_bridge_remember(['ok' => false, 'context' => 'drivers_no_secret', 'fullName' => $full_name]);
            return;
        }

        appli_crm_bridge_post_webhook($url, $secret, [
            'fullName' => $full_name,
            'email' => $email !== '' ? $email : null,
            'phone' => $phone !== '' ? $phone : null,
            'taxiLicense' => $taxi_license !== '' ? $taxi_license : null,
            'formId' => $stable_form,
            'submissionId' => $submission_id,
            'campaignName' => 'appli.taxi-drivers',
            'customFields' => array_filter([
                'elementor_form_name' => $form_name !== '' ? $form_name : null,
                'elementor_form_id' => $form_id !== '' ? $form_id : null,
                'elementor_post_id' => $post_id !== '' ? $post_id : null,
                'taxi_license' => $taxi_license !== '' ? $taxi_license : null,
            ]),
        ], 'drivers');
        return;
    }

    // --- B2B Sales Operation forms ---
    $allowed_names = [
        'yango-business',
        'טופס עסקים',
    ];
    $allowed_ids = [
        'b99e489',
        '43265f5',
    ];

    $name_ok = false;
    foreach ($allowed_names as $allowed) {
        if ($form_name !== '' && function_exists('mb_strtolower')) {
            if (mb_strtolower($form_name) === mb_strtolower($allowed)) {
                $name_ok = true;
                break;
            }
        } elseif ($form_name !== '' && strtolower($form_name) === strtolower($allowed)) {
            $name_ok = true;
            break;
        }
    }
    $id_ok = $form_id !== '' && in_array($form_id, $allowed_ids, true);
    if (!$name_ok && !$id_ok) {
        appli_crm_bridge_remember([
            'ok' => false,
            'context' => 'unmatched_form',
            'form_id' => $form_id,
            'form_name' => $form_name,
            'post_id' => $post_id,
            'fullName' => $full_name,
        ]);
        return;
    }

    $company = $get(['company', 'companyName', 'company_name', 'field_c064625']);
    $city = $get(['city']);
    $source = $get(['source']);
    $medium = $get(['medium']);
    $campaign = $get(['campaign', 'campaignName']);

    $stable_form = $form_id !== '' ? $form_id : $form_name;
    $submission_id = 'elementor-' . $stable_form . '-' . md5(
        strtolower($email) . '|' . $phone . '|' . $full_name . '|' . gmdate('Y-m-d-H')
    );

    $secret = defined('APPLI_SALES_WPFORMS_WEBHOOK_SECRET')
        ? (string) APPLI_SALES_WPFORMS_WEBHOOK_SECRET
        : (string) get_option('appli_sales_wpforms_webhook_secret', '');
    if ($secret === '' && defined('APPLI_CRM_BRIDGE_B2B_SECRET')) {
        $secret = (string) APPLI_CRM_BRIDGE_B2B_SECRET;
    }
    $url = defined('APPLI_SALES_WPFORMS_WEBHOOK_URL')
        ? (string) APPLI_SALES_WPFORMS_WEBHOOK_URL
        : 'https://applitaxi.space/api/sales-operation/webhooks/wpforms';

    if ($secret === '') {
        error_log('[Appli CRM Bridge] B2B webhook secret is not configured.');
        appli_crm_bridge_remember(['ok' => false, 'context' => 'b2b_no_secret', 'fullName' => $full_name]);
        return;
    }

    appli_crm_bridge_post_webhook($url, $secret, [
        'fullName' => $full_name,
        'email' => $email !== '' ? $email : null,
        'phone' => $phone !== '' ? $phone : null,
        'companyName' => $company !== '' ? $company : null,
        'formId' => $stable_form,
        'submissionId' => $submission_id,
        'campaignName' => $campaign !== '' ? $campaign : 'appli.taxi',
        'customFields' => array_filter([
            'city' => $city !== '' ? $city : null,
            'utm_source' => $source !== '' ? $source : null,
            'utm_medium' => $medium !== '' ? $medium : null,
            'utm_campaign' => $campaign !== '' ? $campaign : null,
            'elementor_form_name' => $form_name !== '' ? $form_name : null,
            'elementor_form_id' => $form_id !== '' ? $form_id : null,
        ]),
    ], 'b2b');
}

add_action('elementor_pro/forms/new_record', function ($record, $handler = null) {
    try {
        appli_crm_bridge_handle_elementor_record($record);
    } catch (Throwable $e) {
        error_log('[Appli CRM Bridge] fatal: ' . $e->getMessage());
        appli_crm_bridge_remember([
            'ok' => false,
            'context' => 'exception',
            'error' => $e->getMessage(),
        ]);
    }
}, 5, 2);
