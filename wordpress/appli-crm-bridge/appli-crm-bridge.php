<?php
/**
 * Plugin Name: Appli CRM Form Bridge
 * Description: Sends Elementor form submissions from appli.taxi to Sales Operation CRM (B2B + Drivers Pipeline).
 * Version: 1.2.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Shared helper: POST JSON to CRM webhook.
 */
function appli_crm_bridge_post_webhook($url, $secret, $payload) {
    $response = wp_remote_post($url, [
        'timeout' => 15,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Webhook-Secret' => $secret,
        ],
        'body' => wp_json_encode($payload),
    ]);

    if (is_wp_error($response)) {
        error_log('[Appli CRM Bridge] webhook error: ' . $response->get_error_message());
        return;
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    if ($code < 200 || $code >= 300) {
        error_log('[Appli CRM Bridge] webhook HTTP ' . $code . ' body=' . wp_remote_retrieve_body($response));
    }
}

add_action('elementor_pro/forms/new_record', function ($record, $handler) {
    if (!is_object($record) || !method_exists($record, 'get_form_settings')) {
        return;
    }

    $form_name = (string) $record->get_form_settings('form_name');
    $form_id = '';
    if (isset($_POST['form_id'])) {
        $form_id = sanitize_text_field(wp_unslash((string) $_POST['form_id']));
    }

    $raw_fields = $record->get('fields');
    if (!is_array($raw_fields)) {
        $raw_fields = [];
    }

    $get = function ($keys) use ($raw_fields) {
        foreach ((array) $keys as $key) {
            if (isset($raw_fields[$key]['value']) && $raw_fields[$key]['value'] !== '') {
                return (string) $raw_fields[$key]['value'];
            }
        }
        foreach ($raw_fields as $field) {
            if (!is_array($field)) {
                continue;
            }
            $id = isset($field['id']) ? (string) $field['id'] : '';
            $type = isset($field['type']) ? (string) $field['type'] : '';
            if (in_array($id, (array) $keys, true) || in_array($type, (array) $keys, true)) {
                if (isset($field['value']) && $field['value'] !== '') {
                    return (string) $field['value'];
                }
            }
        }
        return '';
    };

    $full_name = $get(['name', 'fullName', 'full_name']);
    $email = $get(['email']);
    $phone = $get(['phone', 'tel', 'phonenumber', 'field_845eff1']);

    if ($full_name === '') {
        return;
    }

    // --- Drivers Pipeline form ---
    $driver_names = [
        'טופס הצטרפות למערך הנהגים',
    ];
    $driver_ids = [
        '3684f71',
    ];
    $driver_name_ok = false;
    foreach ($driver_names as $allowed) {
        if ($form_name !== '' && mb_strtolower($form_name) === mb_strtolower($allowed)) {
            $driver_name_ok = true;
            break;
        }
    }
    $driver_id_ok = $form_id !== '' && in_array($form_id, $driver_ids, true);

    if ($driver_name_ok || $driver_id_ok) {
        $stable_form = $form_id !== '' ? $form_id : $form_name;
        $submission_id = 'elementor-drivers-' . $stable_form . '-' . md5(
            strtolower($email) . '|' . $phone . '|' . $full_name . '|' . gmdate('Y-m-d-H')
        );

        // Prefer WP option / env; fallback placeholder must be replaced on the server.
        $secret = defined('APPLI_DRIVERS_PIPELINE_WEBHOOK_SECRET')
            ? (string) APPLI_DRIVERS_PIPELINE_WEBHOOK_SECRET
            : (string) get_option('appli_drivers_pipeline_webhook_secret', '');
        $url = defined('APPLI_DRIVERS_PIPELINE_WEBHOOK_URL')
            ? (string) APPLI_DRIVERS_PIPELINE_WEBHOOK_URL
            : 'https://applitaxi.space/api/sales-operation/webhooks/drivers';

        if ($secret === '') {
            error_log('[Appli CRM Bridge] Drivers webhook secret is not configured.');
            return;
        }

        appli_crm_bridge_post_webhook($url, $secret, [
            'fullName' => $full_name,
            'email' => $email !== '' ? $email : null,
            'phone' => $phone !== '' ? $phone : null,
            'formId' => $stable_form,
            'submissionId' => $submission_id,
            'campaignName' => 'appli.taxi-drivers',
            'customFields' => array_filter([
                'elementor_form_name' => $form_name !== '' ? $form_name : null,
                'elementor_form_id' => $form_id !== '' ? $form_id : null,
            ]),
        ]);
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
        if ($form_name !== '' && mb_strtolower($form_name) === mb_strtolower($allowed)) {
            $name_ok = true;
            break;
        }
    }
    $id_ok = $form_id !== '' && in_array($form_id, $allowed_ids, true);
    if (!$name_ok && !$id_ok) {
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
    // Legacy hard-coded secret support if option empty — set via wp-config instead when possible.
    if ($secret === '' && defined('APPLI_CRM_BRIDGE_B2B_SECRET')) {
        $secret = (string) APPLI_CRM_BRIDGE_B2B_SECRET;
    }
    $url = defined('APPLI_SALES_WPFORMS_WEBHOOK_URL')
        ? (string) APPLI_SALES_WPFORMS_WEBHOOK_URL
        : 'https://applitaxi.space/api/sales-operation/webhooks/wpforms';

    if ($secret === '') {
        error_log('[Appli CRM Bridge] B2B webhook secret is not configured.');
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
    ]);
}, 10, 2);
