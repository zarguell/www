---
title: "ZTNA to Services Through Cloudflare"
description: "Setting up Zero Trust Network Access (ZTNA) to self hosted services through Cloudflare for Teams and the WARP client."
pubDate: 2022-09-27
tags: ["homelab", "cloudflare", "zero trust", "ztna", "warp", "sase"]
draft: false
---

## Overview 🔍

If vendor marketing is any indication, "Zero Trust" is the biggest buzzword in security lately. But not without reason; a well implemented security architecture with strong identity verification and zero trust principles is the foundation of good security today. It's amsuing to me how many breaches in the past few months reported in the news have had the same things; valid account, compromise of phishable 2-factor credentials, compromise of enterprise VPN, establish foothold, move laterally.

As Cloudflare tags their practice of ["dogfooding"](https://blog.cloudflare.com/dogfooding-from-home/) Cloudflare Access, for me "dogfooding" is using Cloudflare Acccess to adopt a zero trust approach to my self hosted services. For a while, I have been using Cloudflare Tunnels (formerly known as Argo Tunnels) with identity providers as sort-of a "front line" identity verification to services. This is cool and all, but it doesn't fully automate the identification process, and breaks a lot of "app" functionality. For example, built in functionality of Home Assistant or Bitwarden breaks, due to Cloudflare access prompting for authentication. Plus, it opens the door to a further enhanced security model (device posture checks, malware inspection, step up authentication, and more).

In this post, I'll assume you already have [Cloudflare for Teams](https://blog.cloudflare.com/introducing-cloudflare-for-teams/), with apps configured with public hostnames configured via Cloudflare Tunnels (and perhaps some policies to govern access already). What I want to highlight is the addition of "gateway" access by configuration of managed devices within a team/organization through the "Warp" client.

## Initial Setup 👷

In order to confgiure apps for ZTNA access through the Warp client, you will need clients to utilize Cloudflare's Secure Web Gateway (SWG). For more information on developing Gateway Policies, see the [Cloudflare Docs](https://developers.cloudflare.com/cloudflare-one/policies/filtering/).

The important part here is not necessarily on what Gateway Policies you implement, but that the Cloudflare SWG must be able to inspect HTTP traffic (ie, DNS inspection through forwarding from a defined location is NOT engough), which [requires the WARP client, with trusted certificate](https://developers.cloudflare.com/cloudflare-one/policies/filtering/initial-setup/http/).

Prior to enrolling device, I would recommend configuring a basic device enrollment policy for the WARP client. This is found under ```Settings -> WARP Client -> Device Enrollment Permissions```

Similar to access policies, the enrollment policy defines what devices can enroll in your Cloudflare team. Below is a "family members" policy for which I included a list of list of authorized family member emails. In an enterprise scenario, this could be something more aligned to organization policies, such as "allow all *@acme.organization.com."

![device-policy](/assets/img/device-enrollment-policy.png)

You will also want to configure a device posture check under ```Settings -> WARP Client -> Device Posture```. For my scenario, I have configured the ["Require Gateway"](https://developers.cloudflare.com/cloudflare-one/identity/devices/warp-client-checks/require-gateway/) check. Per Cloudflare, "Require Gateway will only allow requests coming from devices whose traffic is filtered by your organization’s Cloudflare Gateway configuration. This policy is best used when you want to protect company-owned assets by only allowing access to employees" - exactly what we desire to enable ZTNA.

![device-posture](/assets/img/device-posture.png)

Note that device posture checks open up a door to enhance security; allowing more granular access to services based on risk, including enforcing a certain (up-to-date) OS version, precense of security controls, and more.

## Certificate Trust 🤝

Next in the setup process, you will need to add the Cloudflare for Teams certificate as a trusted root certificate in the device you are enrolling for access. Cloudflare provides standard .crt and .pem files in the docs linked [here](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/install-cloudflare-cert), and should be installed as instructed per device vendor.

Installation of this certificate is necessary to allow for HTTP inspection. Platforms such as Android may provide warning that installation of a certificate will allow third parties to view private data sent to websites. This is true - Cloudflare SWG, when performing HTTP inspection, is an "adversary-in-the-middle" for all HTTP requests on the client. In our scenario, this is desirable, as it is only through HTTP inspection that we can direct apps to private gateway access, as well as enforce DLP controls, malware inspection, lockdown allowed tenants, and more.

## Certificate Pinning 📌

For those familiar with TLS interception, whether through transparent proxy, or SWG platform - these issues are nothing new. But I believe it is worth pointing on the "issue" that TLS interception, and the introduction of "adversary-in-the-middle" has on various services, particularly client applications.

One of the biggest hurdles to properly implementing TLS/HTTP inspection across the board is the wide usage of certificate pinning through various vendors. For large detail on the pros/cons of certificate pinning, I recommend checking out this [Digicert article](https://www.digicert.com/blog/certificate-pinning-what-is-certificate-pinning) on the topic - but the TLDR for this scenario is that certificate pinned applictaions indicate a scenario in which, in some shape or form, an application developer has forced their app to be "pinned" to a particular certificate of theirs. When using WARP gateway, or any TLS interception scenario, the previously trusted certificate inspecting the traffic will be presented. This will completely break app functionality, as the backend will be met with "certificate not trusted", or similar errors. Even though the intercepting certificate is trusted at the system level, the certificate pinning of the app ignores this trust.

Luckily, Cloudflare provides a simple "one-click" button. When onboarding on Teams, the first "create HTTP" policy that is pre-templated is a "certificate pinning" policy (pictured below).

![cert-pinning](/assets/img/cert-pinning.png)

The policy defines a list of applications correlating to domains known to cause issue with cert pinning, and defines a policy to bypass, or not inspect the traffic. Implementing this HTTP policy will resolve most common certificate pinning issues. I saw most - because it is not an end-to-end list. As you utilizing the gateway - you will notice normal traffic breaking, often due to certificate pinning. By observing logs and testing bypass of domains, you can walkthrough and remediate some of these issues.

## Device Enrollment 📱

Now that you've trusted the Cloudflare teams certificate, and understand and have bypassed the requisite apps for certificate pinning, you are ready to enroll the client and begin passing HTTP traffic through Cloudflare gateway.

For small homelab usage, I'm going to assume you're running manual deployments of the WARP client (although instructions for deploying via Intune, JAMF, etc exist. And I would love to develop a procedure for managed deployment of an organization WARP client through JumpCloud free tier... but that is a topic for another post...)

The Cloudflare Docs for [manual installation](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/deployment/manual-deployment/) describe the process; either CLI or GUI based per platform. Ultimately, the WARP client will need to be configured to use the "Cloudflare for Teams" login, and you will authenticate to meet the defined device enrollment criteria via configured identity providers, and be granted access to the Cloudflare team via WARP.

## Policy Configuration 🥂

So you have your device enrolled, and you're inspecting HTTP traffic through the gateway. The final step is enable the "requirement" of the gateway to an access application, and use that as a condition to bypass authentication.

For this scenario, I have added a policy "bypass authentication through gateway" for my bitwarden (vaultwarden) Access application.

![bitwarden-bypass](/assets/img/bitwarden-bypass.png)

Within the policy, the only condition I have is the "require gateway", which was defined under WARP Client device posture checks in the initial setup. Again, depending on risk level, additional device posture checks could be enforced as need, so that even a "managed" device could be denied access to bitwarden if not up to patching, missing antivirus, etc.

![require-gateway](/assets/img/require-gateway.png)

After saving the policy - try testing out access. For the Bitwarden scenario, I changed my hostname from an internal DNS name to my public access domain (previously behind an authentication layer). Now, I can sync the Bitwarden app whenever, creating a software defined perimter for access to any of my self hosted services!