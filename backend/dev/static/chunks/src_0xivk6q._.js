(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/vdf/badge/VdfBadge.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "badge": "VdfBadge-module__ZzC9fG__badge",
  "default": "VdfBadge-module__ZzC9fG__default",
  "dot": "VdfBadge-module__ZzC9fG__dot",
  "gold": "VdfBadge-module__ZzC9fG__gold",
  "info": "VdfBadge-module__ZzC9fG__info",
  "pulseGlow": "VdfBadge-module__ZzC9fG__pulseGlow",
  "success": "VdfBadge-module__ZzC9fG__success",
});
}),
"[project]/src/components/vdf/badge/VdfBadge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VdfBadge",
    ()=>VdfBadge,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$badge$2f$VdfBadge$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/vdf/badge/VdfBadge.module.css [app-client] (css module)");
;
;
function VdfBadge({ children, variant = 'default', dot, className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$badge$2f$VdfBadge$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].badge} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$badge$2f$VdfBadge$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"][variant]} ${className || ''}`,
        children: [
            dot && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$badge$2f$VdfBadge$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].dot
            }, void 0, false, {
                fileName: "[project]/src/components/vdf/badge/VdfBadge.tsx",
                lineNumber: 13,
                columnNumber: 15
            }, this),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/vdf/badge/VdfBadge.tsx",
        lineNumber: 12,
        columnNumber: 5
    }, this);
}
_c = VdfBadge;
const __TURBOPACK__default__export__ = VdfBadge;
var _c;
__turbopack_context__.k.register(_c, "VdfBadge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/vdf/card/VdfCard.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "card": "VdfCard-module__raMgwW__card",
  "featured": "VdfCard-module__raMgwW__featured",
  "glass": "VdfCard-module__raMgwW__glass",
  "glassStrong": "VdfCard-module__raMgwW__glassStrong",
  "hoverLift": "VdfCard-module__raMgwW__hoverLift",
});
}),
"[project]/src/components/vdf/card/VdfCard.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VdfCard",
    ()=>VdfCard,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/vdf/card/VdfCard.module.css [app-client] (css module)");
;
;
function VdfCard({ children, variant = 'glass', accentColor, hoverLift = true, className, onClick }) {
    const variantClass = variant === 'glass-strong' ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].glassStrong : variant === 'featured' ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].featured : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].glass;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].card} ${variantClass} ${hoverLift ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].hoverLift : ''} ${className || ''}`,
        style: accentColor ? {
            '--card-accent': accentColor
        } : undefined,
        onClick: onClick,
        children: children
    }, void 0, false, {
        fileName: "[project]/src/components/vdf/card/VdfCard.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, this);
}
_c = VdfCard;
const __TURBOPACK__default__export__ = VdfCard;
var _c;
__turbopack_context__.k.register(_c, "VdfCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/vdf/avatar/VdfAvatar.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "avatar": "VdfAvatar-module__fc_KZW__avatar",
  "lg": "VdfAvatar-module__fc_KZW__lg",
  "md": "VdfAvatar-module__fc_KZW__md",
  "sm": "VdfAvatar-module__fc_KZW__sm",
});
}),
"[project]/src/components/vdf/avatar/VdfAvatar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VdfAvatar",
    ()=>VdfAvatar,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$avatar$2f$VdfAvatar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/vdf/avatar/VdfAvatar.module.css [app-client] (css module)");
;
;
function VdfAvatar({ initials, size = 'md', className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$avatar$2f$VdfAvatar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].avatar} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$avatar$2f$VdfAvatar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"][size]} ${className || ''}`,
        children: initials
    }, void 0, false, {
        fileName: "[project]/src/components/vdf/avatar/VdfAvatar.tsx",
        lineNumber: 11,
        columnNumber: 5
    }, this);
}
_c = VdfAvatar;
const __TURBOPACK__default__export__ = VdfAvatar;
var _c;
__turbopack_context__.k.register(_c, "VdfAvatar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/vdf/icon/VdfIcon.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "icon": "VdfIcon-module__-AmzqW__icon",
  "lg": "VdfIcon-module__-AmzqW__lg",
  "md": "VdfIcon-module__-AmzqW__md",
  "sm": "VdfIcon-module__-AmzqW__sm",
});
}),
"[project]/src/components/vdf/icon/VdfIcon.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VdfIcon",
    ()=>VdfIcon,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/vdf/icon/VdfIcon.module.css [app-client] (css module)");
;
;
function VdfIcon({ children, glowColor, size = 'md', className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].icon} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"][size]} ${className || ''}`,
        style: glowColor ? {
            '--icon-glow': glowColor
        } : undefined,
        children: children
    }, void 0, false, {
        fileName: "[project]/src/components/vdf/icon/VdfIcon.tsx",
        lineNumber: 12,
        columnNumber: 5
    }, this);
}
_c = VdfIcon;
const __TURBOPACK__default__export__ = VdfIcon;
var _c;
__turbopack_context__.k.register(_c, "VdfIcon");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/vdf/gold-thread/VdfGoldThread.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "thread": "VdfGoldThread-module__s7l4qq__thread",
});
}),
"[project]/src/components/vdf/gold-thread/VdfGoldThread.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VdfGoldThread",
    ()=>VdfGoldThread,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$gold$2d$thread$2f$VdfGoldThread$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/vdf/gold-thread/VdfGoldThread.module.css [app-client] (css module)");
;
;
function VdfGoldThread({ maxWidth = '600px', className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$gold$2d$thread$2f$VdfGoldThread$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].thread} ${className || ''}`,
        style: {
            maxWidth
        },
        "aria-hidden": "true"
    }, void 0, false, {
        fileName: "[project]/src/components/vdf/gold-thread/VdfGoldThread.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
_c = VdfGoldThread;
const __TURBOPACK__default__export__ = VdfGoldThread;
var _c;
__turbopack_context__.k.register(_c, "VdfGoldThread");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/vdf/noise-overlay/VdfNoiseOverlay.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "overlay": "VdfNoiseOverlay-module__9uuiEa__overlay",
});
}),
"[project]/src/components/vdf/noise-overlay/VdfNoiseOverlay.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VdfNoiseOverlay",
    ()=>VdfNoiseOverlay,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$noise$2d$overlay$2f$VdfNoiseOverlay$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/vdf/noise-overlay/VdfNoiseOverlay.module.css [app-client] (css module)");
;
;
function VdfNoiseOverlay({ opacity = 0.025, className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$noise$2d$overlay$2f$VdfNoiseOverlay$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].overlay} ${className || ''}`,
        style: {
            opacity
        },
        "aria-hidden": "true"
    }, void 0, false, {
        fileName: "[project]/src/components/vdf/noise-overlay/VdfNoiseOverlay.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
_c = VdfNoiseOverlay;
const __TURBOPACK__default__export__ = VdfNoiseOverlay;
var _c;
__turbopack_context__.k.register(_c, "VdfNoiseOverlay");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/vdf/atmosphere/VdfAtmosphere.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "atmosphere": "VdfAtmosphere-module__E-mmxW__atmosphere",
});
}),
"[project]/src/components/vdf/atmosphere/VdfAtmosphere.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VdfAtmosphere",
    ()=>VdfAtmosphere,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$atmosphere$2f$VdfAtmosphere$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/components/vdf/atmosphere/VdfAtmosphere.module.css [app-client] (css module)");
;
;
function VdfAtmosphere({ className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$atmosphere$2f$VdfAtmosphere$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].atmosphere} ${className || ''}`,
        "aria-hidden": "true"
    }, void 0, false, {
        fileName: "[project]/src/components/vdf/atmosphere/VdfAtmosphere.tsx",
        lineNumber: 8,
        columnNumber: 10
    }, this);
}
_c = VdfAtmosphere;
const __TURBOPACK__default__export__ = VdfAtmosphere;
var _c;
__turbopack_context__.k.register(_c, "VdfAtmosphere");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/vdf/index.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/button/VdfButton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$badge$2f$VdfBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/badge/VdfBadge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/card/VdfCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$avatar$2f$VdfAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/avatar/VdfAvatar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/icon/VdfIcon.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$gold$2d$thread$2f$VdfGoldThread$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/gold-thread/VdfGoldThread.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$noise$2d$overlay$2f$VdfNoiseOverlay$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/noise-overlay/VdfNoiseOverlay.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$atmosphere$2f$VdfAtmosphere$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/atmosphere/VdfAtmosphere.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$particles$2f$VdfParticles$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/particles/VdfParticles.tsx [app-client] (ecmascript)");
;
;
;
;
;
;
;
;
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/Navbar.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "brand": "Navbar-module__xYI6Aq__brand",
  "cta": "Navbar-module__xYI6Aq__cta",
  "iconBox": "Navbar-module__xYI6Aq__iconBox",
  "link": "Navbar-module__xYI6Aq__link",
  "links": "Navbar-module__xYI6Aq__links",
  "name": "Navbar-module__xYI6Aq__name",
  "nav": "Navbar-module__xYI6Aq__nav",
  "scrolled": "Navbar-module__xYI6Aq__scrolled",
  "show": "Navbar-module__xYI6Aq__show",
  "toggle": "Navbar-module__xYI6Aq__toggle",
});
}),
"[project]/src/app/(public)/landing/components/Navbar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Navbar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/components/vdf/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/button/VdfButton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/components/Navbar.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
function Navbar({ brandName, brandIcon, links }) {
    _s();
    const [scrolled, setScrolled] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [mobileOpen, setMobileOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Navbar.useEffect": ()=>{
            const onScroll = {
                "Navbar.useEffect.onScroll": ()=>setScrolled(window.scrollY > 60)
            }["Navbar.useEffect.onScroll"];
            window.addEventListener('scroll', onScroll, {
                passive: true
            });
            return ({
                "Navbar.useEffect": ()=>window.removeEventListener('scroll', onScroll)
            })["Navbar.useEffect"];
        }
    }["Navbar.useEffect"], []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].nav} ${scrolled ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].scrolled : ''}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: "#",
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].brand,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].iconBox,
                        children: brandIcon || /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            viewBox: "0 0 24 24",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: "2",
                            strokeLinecap: "round",
                            width: "16",
                            height: "16",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M12 2L2 7l10 5 10-5-10-5z"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                                    lineNumber: 35,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M2 17l10 5 10-5"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                                    lineNumber: 36,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M2 12l10 5 10-5"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                                    lineNumber: 37,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                            lineNumber: 34,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                        lineNumber: 32,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].name,
                        children: brandName
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                lineNumber: 31,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].links} ${mobileOpen ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].show : ''}`,
                children: links.map((link)=>link.isCta ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfButton"], {
                            variant: "outline",
                            size: "sm",
                            href: link.href,
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].cta,
                            children: link.label
                        }, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                            lineNumber: 48,
                            columnNumber: 15
                        }, this)
                    }, link.href, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                        lineNumber: 47,
                        columnNumber: 13
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                            href: link.href,
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].link,
                            onClick: ()=>setMobileOpen(false),
                            children: link.label
                        }, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                            lineNumber: 54,
                            columnNumber: 15
                        }, this)
                    }, link.href, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                        lineNumber: 53,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                lineNumber: 44,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Navbar$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].toggle,
                onClick: ()=>setMobileOpen(!mobileOpen),
                "aria-label": "Toggle navigation",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                        lineNumber: 67,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                        lineNumber: 67,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                        lineNumber: 67,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
                lineNumber: 62,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/Navbar.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
_s(Navbar, "moUcU2J4YHazgmQMN2Ea+ACEGYM=");
_c = Navbar;
var _c;
__turbopack_context__.k.register(_c, "Navbar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useScrollReveal",
    ()=>useScrollReveal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
function useScrollReveal(options) {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useScrollReveal.useEffect": ()=>{
            const el = ref.current;
            if (!el) return;
            const observer = new IntersectionObserver({
                "useScrollReveal.useEffect": ([entry])=>{
                    if (entry.isIntersecting) {
                        el.classList.add('visible');
                        observer.unobserve(el);
                    }
                }
            }["useScrollReveal.useEffect"], {
                threshold: 0.12,
                rootMargin: '0px 0px -40px 0px',
                ...options
            });
            observer.observe(el);
            return ({
                "useScrollReveal.useEffect": ()=>observer.disconnect()
            })["useScrollReveal.useEffect"];
        }
    }["useScrollReveal.useEffect"], []);
    return ref;
}
_s(useScrollReveal, "8uVE59eA/r6b92xF80p7sH8rXLk=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/page.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "animateOnScroll": "page-module__T1nXJG__animateOnScroll",
  "fadeInUp": "page-module__T1nXJG__fadeInUp",
  "featureDesc": "page-module__T1nXJG__featureDesc",
  "featureTag": "page-module__T1nXJG__featureTag",
  "featureTitle": "page-module__T1nXJG__featureTitle",
  "features": "page-module__T1nXJG__features",
  "featuresGrid": "page-module__T1nXJG__featuresGrid",
  "featuresHeader": "page-module__T1nXJG__featuresHeader",
  "featuresSubtitle": "page-module__T1nXJG__featuresSubtitle",
  "finalCta": "page-module__T1nXJG__finalCta",
  "finalCtaActions": "page-module__T1nXJG__finalCtaActions",
  "finalCtaContent": "page-module__T1nXJG__finalCtaContent",
  "finalCtaDesc": "page-module__T1nXJG__finalCtaDesc",
  "finalCtaNote": "page-module__T1nXJG__finalCtaNote",
  "footer": "page-module__T1nXJG__footer",
  "footerBottom": "page-module__T1nXJG__footerBottom",
  "footerBrand": "page-module__T1nXJG__footerBrand",
  "footerBrandCompany": "page-module__T1nXJG__footerBrandCompany",
  "footerBrandName": "page-module__T1nXJG__footerBrandName",
  "footerBrandTagline": "page-module__T1nXJG__footerBrandTagline",
  "footerContent": "page-module__T1nXJG__footerContent",
  "footerCopy": "page-module__T1nXJG__footerCopy",
  "footerLegal": "page-module__T1nXJG__footerLegal",
  "footerLinksGroup": "page-module__T1nXJG__footerLinksGroup",
  "goldText": "page-module__T1nXJG__goldText",
  "hero": "page-module__T1nXJG__hero",
  "heroActions": "page-module__T1nXJG__heroActions",
  "heroStagger0": "page-module__T1nXJG__heroStagger0",
  "heroStagger1": "page-module__T1nXJG__heroStagger1" + " " + "page-module__T1nXJG__sectionTitle",
  "heroStat": "page-module__T1nXJG__heroStat",
  "heroStatLabel": "page-module__T1nXJG__heroStatLabel",
  "heroStatValue": "page-module__T1nXJG__heroStatValue",
  "heroStats": "page-module__T1nXJG__heroStats",
  "heroSub": "page-module__T1nXJG__heroSub",
  "howItWorks": "page-module__T1nXJG__howItWorks",
  "howItWorksHeader": "page-module__T1nXJG__howItWorksHeader",
  "painDesc": "page-module__T1nXJG__painDesc",
  "painGrid": "page-module__T1nXJG__painGrid",
  "painSection": "page-module__T1nXJG__painSection",
  "painTitle": "page-module__T1nXJG__painTitle",
  "pricing": "page-module__T1nXJG__pricing",
  "pricingAmount": "page-module__T1nXJG__pricingAmount",
  "pricingBadge": "page-module__T1nXJG__pricingBadge",
  "pricingCard": "page-module__T1nXJG__pricingCard",
  "pricingCurrency": "page-module__T1nXJG__pricingCurrency",
  "pricingDesc": "page-module__T1nXJG__pricingDesc",
  "pricingFeatures": "page-module__T1nXJG__pricingFeatures",
  "pricingGrid": "page-module__T1nXJG__pricingGrid",
  "pricingHeader": "page-module__T1nXJG__pricingHeader",
  "pricingPeriod": "page-module__T1nXJG__pricingPeriod",
  "pricingSubtitle": "page-module__T1nXJG__pricingSubtitle",
  "pricingTier": "page-module__T1nXJG__pricingTier",
  "pricingValue": "page-module__T1nXJG__pricingValue",
  "proofLogo": "page-module__T1nXJG__proofLogo",
  "proofLogos": "page-module__T1nXJG__proofLogos",
  "sectionEyebrow": "page-module__T1nXJG__sectionEyebrow",
  "sectionTitle": "page-module__T1nXJG__sectionTitle",
  "shimmer": "page-module__T1nXJG__shimmer",
  "socialProof": "page-module__T1nXJG__socialProof",
  "socialProofLabel": "page-module__T1nXJG__socialProofLabel",
  "step": "page-module__T1nXJG__step",
  "stepContent": "page-module__T1nXJG__stepContent",
  "stepNumber": "page-module__T1nXJG__stepNumber",
  "stepTime": "page-module__T1nXJG__stepTime",
  "steps": "page-module__T1nXJG__steps",
  "testimonialAuthor": "page-module__T1nXJG__testimonialAuthor",
  "testimonialName": "page-module__T1nXJG__testimonialName",
  "testimonialQuote": "page-module__T1nXJG__testimonialQuote",
  "testimonialRole": "page-module__T1nXJG__testimonialRole",
  "testimonials": "page-module__T1nXJG__testimonials",
  "testimonialsGrid": "page-module__T1nXJG__testimonialsGrid",
  "testimonialsHeader": "page-module__T1nXJG__testimonialsHeader",
});
}),
"[project]/src/app/(public)/landing/components/PainSection.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PainSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/components/vdf/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/card/VdfCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/icon/VdfIcon.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
'use client';
;
;
;
const painPoints = [
    {
        icon: '\uD83D\uDCCA',
        title: 'Scattered Data, Zero Visibility',
        desc: 'Client portfolios in CAMS, KFintech, InvestWell \u2014 none of them talk to each other. You spend hours just getting a consolidated view.'
    },
    {
        icon: '\u23F0',
        title: 'Manual Reporting Kills Weekends',
        desc: 'Every quarter, you\u2019re copy-pasting NAVs, computing XIRR in Excel, and formatting reports that clients barely read.'
    },
    {
        icon: '\uD83C\uDFAF',
        title: 'Goal Planning is Guesswork',
        desc: 'SIP calculators tell you nothing about goal gaps, tax harvesting opportunities, or when to rebalance. Clients deserve better.'
    },
    {
        icon: '\uD83D\uDD15',
        title: 'SIP Bounces Go Unnoticed',
        desc: 'A bounced SIP means lost AUM and a disappointed client. Without alerts, you find out weeks later \u2014 if at all.'
    }
];
function PainCard({ icon, title, desc }) {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: ref,
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfCard"], {
            variant: "glass",
            accentColor: "var(--color-accent3)",
            hoverLift: true,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfIcon"], {
                    size: "sm",
                    glowColor: "rgba(232, 139, 139, 0.1)",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: icon
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                        lineNumber: 36,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                    lineNumber: 35,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].painTitle,
                    children: title
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                    lineNumber: 38,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].painDesc,
                    children: desc
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                    lineNumber: 39,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
            lineNumber: 34,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
_s(PainCard, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c = PainCard;
function PainSection() {
    _s1();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].painSection,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: ref,
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                        children: "The problem"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionTitle,
                        children: [
                            "You Became an MFD to Build Wealth.",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                                lineNumber: 52,
                                columnNumber: 45
                            }, this),
                            "Not to Drown in Spreadsheets."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                        lineNumber: 51,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                lineNumber: 49,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].painGrid,
                children: painPoints.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PainCard, {
                        ...p
                    }, p.title, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                        lineNumber: 57,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/PainSection.tsx",
        lineNumber: 48,
        columnNumber: 5
    }, this);
}
_s1(PainSection, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c1 = PainSection;
var _c, _c1;
__turbopack_context__.k.register(_c, "PainCard");
__turbopack_context__.k.register(_c1, "PainSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/FeaturesSection.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>FeaturesSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/components/vdf/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/card/VdfCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/icon/VdfIcon.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
'use client';
;
;
;
const features = [
    {
        icon: '\uD83D\uDCC8',
        title: 'Portfolio Intelligence',
        desc: 'Consolidated holdings across AMCs with real-time NAV tracking, XIRR computation, and asset allocation breakdowns. See what matters \u2014 instantly.',
        tag: '4 handlers',
        accent: '#C9A84C',
        accentGlow: 'rgba(201, 168, 76, 0.1)'
    },
    {
        icon: '\uD83D\uDC65',
        title: 'Client 360\u00B0',
        desc: 'Complete client profiles with family mapping, goal tracking, KYC status, and communication history. Every relationship, fully visible.',
        tag: '3 handlers',
        accent: '#5EAAF0',
        accentGlow: 'rgba(94, 170, 240, 0.1)'
    },
    {
        icon: '\uD83D\uDCE1',
        title: 'Market Pulse',
        desc: 'NAV feeds, category performance, fund comparisons, and trending schemes \u2014 updated daily from MFAPI. Know the market before your clients ask.',
        tag: '5 handlers',
        accent: '#4ECDC4',
        accentGlow: 'rgba(78, 205, 196, 0.1)'
    },
    {
        icon: '\uD83C\uDFAF',
        title: 'Goal-Based Planning',
        desc: 'SIP calculators, retirement planning, tax-harvest optimizer, and portfolio rebalancing \u2014 all backed by real numbers, not assumptions.',
        tag: '5 handlers',
        accent: '#9B8FE8',
        accentGlow: 'rgba(155, 143, 232, 0.1)'
    },
    {
        icon: '\uD83D\uDCE5',
        title: 'Smart Import',
        desc: 'Upload CAS statements from CAMS/KFintech, InvestWell exports, or MFAPI feeds. Auto-parsed, auto-matched, auto-reconciled.',
        tag: '4 handlers',
        accent: '#E8B44C',
        accentGlow: 'rgba(232, 180, 76, 0.1)'
    },
    {
        icon: '\uD83D\uDD14',
        title: 'Alerts & Reports',
        desc: 'SIP bounce detection, maturity reminders, portfolio review triggers, and auto-generated quarterly reports. Your practice runs on autopilot.',
        tag: 'coming soon',
        accent: '#E88B8B',
        accentGlow: 'rgba(232, 139, 139, 0.1)'
    }
];
function FeatureCard({ feature }) {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: ref,
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfCard"], {
            variant: "glass",
            accentColor: feature.accent,
            hoverLift: true,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$icon$2f$VdfIcon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfIcon"], {
                    size: "md",
                    glowColor: feature.accentGlow,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: feature.icon
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                        lineNumber: 73,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                    lineNumber: 72,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].featureTitle,
                    children: feature.title
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                    lineNumber: 75,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].featureDesc,
                    children: feature.desc
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                    lineNumber: 76,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].featureTag,
                    style: {
                        '--tag-accent': feature.accent,
                        '--tag-glow': feature.accentGlow
                    },
                    children: feature.tag
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                    lineNumber: 77,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
            lineNumber: 71,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
        lineNumber: 70,
        columnNumber: 5
    }, this);
}
_s(FeatureCard, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c = FeatureCard;
function FeaturesSection() {
    _s1();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].features,
        id: "features",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: ref,
                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].featuresHeader} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                        children: "What's inside"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                        lineNumber: 93,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionTitle,
                        children: [
                            "Six Skills. One Platform.",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                                lineNumber: 95,
                                columnNumber: 36
                            }, this),
                            "Complete Control."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                        lineNumber: 94,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].featuresSubtitle,
                        children: "Every skill is purpose-built for how Indian MFDs actually work — not retrofitted from generic CRM tools."
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                lineNumber: 92,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].featuresGrid,
                children: features.map((f)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(FeatureCard, {
                        feature: f
                    }, f.title, false, {
                        fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                        lineNumber: 103,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
                lineNumber: 101,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/FeaturesSection.tsx",
        lineNumber: 91,
        columnNumber: 5
    }, this);
}
_s1(FeaturesSection, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c1 = FeaturesSection;
var _c, _c1;
__turbopack_context__.k.register(_c, "FeatureCard");
__turbopack_context__.k.register(_c1, "FeaturesSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/Stepper.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Stepper
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
const steps = [
    {
        title: 'Create Your Firm Account',
        description: 'Register your MFD practice. Set up your brand identity, team roles, and client segments. Multi-tenant from day one \u2014 your data is yours alone.',
        meta: '~ 2 minutes'
    },
    {
        title: 'Import Your Client Data',
        description: 'Upload CAS statements, InvestWell exports, or connect via MFAPI. Our parser auto-detects formats, matches schemes, and reconciles holdings.',
        meta: '~ 5 minutes'
    },
    {
        title: 'See the Full Picture',
        description: 'Your dashboard lights up \u2014 consolidated portfolios, goal gaps, market movements, and actionable insights across every client, every scheme.',
        meta: 'instant'
    },
    {
        title: 'Advise with Confidence',
        description: 'Run goal plans, compare funds, spot rebalancing opportunities, and generate client-ready reports \u2014 all backed by real-time data.',
        meta: 'ongoing'
    }
];
function Step({ step, index }) {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: ref,
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].step} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].stepNumber,
                children: index + 1
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].stepContent,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        children: step.title
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: step.description
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    step.meta && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].stepTime,
                        children: step.meta
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
                        lineNumber: 43,
                        columnNumber: 23
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
        lineNumber: 38,
        columnNumber: 5
    }, this);
}
_s(Step, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c = Step;
function Stepper() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].steps,
        children: steps.map((step, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Step, {
                step: step,
                index: i
            }, step.title, false, {
                fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
                lineNumber: 53,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/src/app/(public)/landing/components/Stepper.tsx",
        lineNumber: 51,
        columnNumber: 5
    }, this);
}
_c1 = Stepper;
var _c, _c1;
__turbopack_context__.k.register(_c, "Step");
__turbopack_context__.k.register(_c1, "Stepper");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/HowItWorks.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HowItWorks
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Stepper$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/components/Stepper.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
function HowItWorks() {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].howItWorks,
        id: "how-it-works",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: ref,
                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].howItWorksHeader} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                        children: "Getting started"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/HowItWorks.tsx",
                        lineNumber: 12,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionTitle,
                        children: [
                            "From Signup to Intelligence",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                fileName: "[project]/src/app/(public)/landing/components/HowItWorks.tsx",
                                lineNumber: 14,
                                columnNumber: 38
                            }, this),
                            "in Under 10 Minutes"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/(public)/landing/components/HowItWorks.tsx",
                        lineNumber: 13,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/HowItWorks.tsx",
                lineNumber: 11,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$Stepper$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/HowItWorks.tsx",
                lineNumber: 17,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/HowItWorks.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
_s(HowItWorks, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c = HowItWorks;
var _c;
__turbopack_context__.k.register(_c, "HowItWorks");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/PricingCard.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PricingCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/components/vdf/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/card/VdfCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$badge$2f$VdfBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/badge/VdfBadge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/button/VdfButton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
;
;
function PricingCard({ tier, description, currency = '\u20B9', price, period = '/ month', features, ctaLabel, ctaHref, featured, badge }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfCard"], {
        variant: featured ? 'featured' : 'glass',
        hoverLift: true,
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingCard,
        children: [
            badge && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$badge$2f$VdfBadge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfBadge"], {
                variant: "gold",
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingBadge,
                children: badge
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                lineNumber: 31,
                columnNumber: 17
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingTier,
                children: tier
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingDesc,
                children: description
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                lineNumber: 33,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingAmount,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingCurrency,
                        children: currency
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                        lineNumber: 35,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingValue,
                        children: price
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                        lineNumber: 36,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingPeriod,
                        children: period
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingFeatures,
                children: features.map((f)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        children: f
                    }, f, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                        lineNumber: 41,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfButton"], {
                variant: featured ? 'primary' : 'ghost',
                href: ctaHref,
                fullWidth: true,
                size: "md",
                children: ctaLabel
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
                lineNumber: 44,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/PricingCard.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
_c = PricingCard;
var _c;
__turbopack_context__.k.register(_c, "PricingCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/PricingSection.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PricingSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$PricingCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/components/PricingCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const tiers = [
    {
        tier: 'Starter',
        description: 'For individual MFDs getting started',
        price: '0',
        features: [
            'Up to 50 clients',
            'Portfolio & NAV tracking',
            'CAS import (CAMS/KFintech)',
            'Basic goal planning',
            '1 user seat'
        ],
        ctaLabel: 'Get Started Free',
        ctaHref: '#start'
    },
    {
        tier: 'Professional',
        description: 'For growing MFD practices',
        price: '1,999',
        features: [
            'Up to 500 clients',
            'All 8 skill modules',
            'Auto-generated reports',
            'SIP bounce alerts',
            'Tax harvest optimizer',
            '5 user seats',
            'Priority support'
        ],
        ctaLabel: 'Start 14-Day Trial',
        ctaHref: '#start',
        featured: true,
        badge: 'Most Popular'
    },
    {
        tier: 'Enterprise',
        description: 'For large firms & RIAs',
        price: '4,999',
        features: [
            'Unlimited clients',
            'White-label client portal',
            'Custom branding & themes',
            'API access',
            'Unlimited seats',
            'Dedicated account manager',
            'SLA guarantee'
        ],
        ctaLabel: 'Contact Sales',
        ctaHref: '#start'
    }
];
function PricingSection() {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricing,
        id: "pricing",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: ref,
                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingHeader} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                        children: "Simple pricing"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionTitle,
                        children: "Built for MFDs, Priced for Growth"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingSubtitle,
                        children: "Start free. Scale when you're ready. No hidden fees."
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
                        lineNumber: 43,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].pricingGrid,
                children: tiers.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$PricingCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            ...t
                        }, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
                            lineNumber: 48,
                            columnNumber: 13
                        }, this)
                    }, t.tier, false, {
                        fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
                        lineNumber: 47,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
                lineNumber: 45,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/PricingSection.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
_s(PricingSection, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c = PricingSection;
var _c;
__turbopack_context__.k.register(_c, "PricingSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/TestimonialCard.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TestimonialCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/components/vdf/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/card/VdfCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$avatar$2f$VdfAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/avatar/VdfAvatar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
;
;
function TestimonialCard({ quote, authorName, authorRole, authorInitials }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$card$2f$VdfCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfCard"], {
        variant: "glass",
        hoverLift: false,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].testimonialQuote,
                children: quote
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/TestimonialCard.tsx",
                lineNumber: 14,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].testimonialAuthor,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$avatar$2f$VdfAvatar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfAvatar"], {
                        initials: authorInitials,
                        size: "md"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/TestimonialCard.tsx",
                        lineNumber: 16,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].testimonialName,
                                children: authorName
                            }, void 0, false, {
                                fileName: "[project]/src/app/(public)/landing/components/TestimonialCard.tsx",
                                lineNumber: 18,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].testimonialRole,
                                children: authorRole
                            }, void 0, false, {
                                fileName: "[project]/src/app/(public)/landing/components/TestimonialCard.tsx",
                                lineNumber: 19,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/(public)/landing/components/TestimonialCard.tsx",
                        lineNumber: 17,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/TestimonialCard.tsx",
                lineNumber: 15,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/TestimonialCard.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
_c = TestimonialCard;
var _c;
__turbopack_context__.k.register(_c, "TestimonialCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/TestimonialsSection.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TestimonialsSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$TestimonialCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/components/TestimonialCard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const testimonials = [
    {
        quote: 'I was spending 3 hours every Saturday building client reports in Excel. Now it\u2019s one click. My weekends are mine again.',
        authorName: 'Rajesh Kumar',
        authorRole: 'Independent MFD, Pune \u00B7 180 clients',
        authorInitials: 'RK'
    },
    {
        quote: 'The goal-gap visualization changed how I have conversations with clients. They see the math, they trust the plan. My SIP book grew 40% in 6 months.',
        authorName: 'Priya Sharma',
        authorRole: 'Wealth Planner, Bangalore \u00B7 320 clients',
        authorInitials: 'PS'
    },
    {
        quote: 'We onboarded our entire firm in one afternoon. CAS import parsed 12,000 transactions without a single mismatch. That\u2019s never happened before.',
        authorName: 'Anil Mehta',
        authorRole: 'Director, Finwise Distributors \u00B7 1,200 clients',
        authorInitials: 'AM'
    }
];
function TestimonialsSection() {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].testimonials,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: ref,
                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].testimonialsHeader} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionEyebrow,
                        children: "What MFDs are saying"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/TestimonialsSection.tsx",
                        lineNumber: 33,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionTitle,
                        children: "Built With Distributors, For Distributors"
                    }, void 0, false, {
                        fileName: "[project]/src/app/(public)/landing/components/TestimonialsSection.tsx",
                        lineNumber: 34,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/(public)/landing/components/TestimonialsSection.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].testimonialsGrid,
                children: testimonials.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$components$2f$TestimonialCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            ...t
                        }, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/TestimonialsSection.tsx",
                            lineNumber: 39,
                            columnNumber: 13
                        }, this)
                    }, t.authorInitials, false, {
                        fileName: "[project]/src/app/(public)/landing/components/TestimonialsSection.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/app/(public)/landing/components/TestimonialsSection.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/(public)/landing/components/TestimonialsSection.tsx",
        lineNumber: 31,
        columnNumber: 5
    }, this);
}
_s(TestimonialsSection, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c = TestimonialsSection;
var _c;
__turbopack_context__.k.register(_c, "TestimonialsSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/(public)/landing/components/FinalCta.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>FinalCta
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/components/vdf/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/vdf/button/VdfButton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/useScrollReveal.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/src/app/(public)/landing/page.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const ArrowIcon = ()=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M5 12h14M12 5l7 7-7 7"
        }, void 0, false, {
            fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
            lineNumber: 9,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
        lineNumber: 8,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0));
_c = ArrowIcon;
function FinalCta() {
    _s();
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].finalCta,
        id: "start",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            ref: ref,
            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].finalCtaContent} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].animateOnScroll}`,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].sectionTitle,
                    children: [
                        "Your Clients Deserve",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                            lineNumber: 19,
                            columnNumber: 31
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].goldText,
                            children: "Smarter Advice"
                        }, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                            lineNumber: 20,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                    lineNumber: 18,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].finalCtaDesc,
                    children: "Join the early access program and transform your MFD practice with AI-powered intelligence. Limited spots for founding members."
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                    lineNumber: 22,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].finalCtaActions,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfButton"], {
                            variant: "primary",
                            href: "mailto:charan@vikuna.tech?subject=ProessionalKey Early Access",
                            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ArrowIcon, {}, void 0, false, {
                                fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                                lineNumber: 27,
                                columnNumber: 115
                            }, this),
                            children: "Request Early Access"
                        }, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                            lineNumber: 27,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$vdf$2f$button$2f$VdfButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VdfButton"], {
                            variant: "ghost",
                            href: "#features",
                            children: "Explore Features"
                        }, void 0, false, {
                            fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                            lineNumber: 30,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                    lineNumber: 26,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$public$292f$landing$2f$page$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].finalCtaNote,
                    children: "No credit card required · Free tier available · Cancel anytime"
                }, void 0, false, {
                    fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
                    lineNumber: 34,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
            lineNumber: 17,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/(public)/landing/components/FinalCta.tsx",
        lineNumber: 16,
        columnNumber: 5
    }, this);
}
_s(FinalCta, "79FN6PjZhT66fD4Cl/dmgIBwU/M=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$useScrollReveal$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useScrollReveal"]
    ];
});
_c1 = FinalCta;
var _c, _c1;
__turbopack_context__.k.register(_c, "ArrowIcon");
__turbopack_context__.k.register(_c1, "FinalCta");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_0xivk6q._.js.map