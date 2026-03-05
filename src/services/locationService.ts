/**
 * 地理位置服务
 * 提供反向地理编码、IP定位回退、附近POI搜索等纯逻辑功能
 */
import { requestUrl, Platform } from "obsidian";

export interface GeoCoordinates {
    lat: number;
    lng: number;
}

export interface LocationResult {
    address: string;
    coords?: GeoCoordinates;
}

/**
 * 反向地理编码：将坐标转为中文地址
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const response = await requestUrl({
            url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            headers: { "Accept-Language": "zh-CN" }
        });

        if (response.status === 200) {
            const data = response.json;
            const addr = data.address;
            let fullAddress = "";

            if (addr.state) fullAddress += addr.state;
            if (addr.city && addr.city !== addr.state) fullAddress += addr.city;
            if (addr.city_district) fullAddress += addr.city_district;
            if (addr.county && addr.county !== addr.city_district) fullAddress += addr.county;
            if (addr.town) fullAddress += addr.town;
            if (addr.village) fullAddress += addr.village;
            if (addr.suburb && !fullAddress.includes(addr.suburb)) fullAddress += addr.suburb;
            if (addr.neighbourhood && !fullAddress.includes(addr.neighbourhood)) fullAddress += addr.neighbourhood;
            if (addr.quarter && !fullAddress.includes(addr.quarter)) fullAddress += addr.quarter;
            if (addr.road && !fullAddress.includes(addr.road)) fullAddress += addr.road;
            if (addr.house_number) fullAddress += addr.house_number + "号";
            const poi = addr.building || addr.amenity || addr.shop || addr.leisure || addr.tourism;
            if (poi && !fullAddress.includes(poi)) fullAddress += poi;

            return fullAddress || data.display_name || "";
        }
    } catch (e) {
        console.error("Reverse geocoding failed", e);
    }
    return "";
}

/**
 * IP 定位回退方案
 */
export async function fallbackToIP(): Promise<LocationResult> {
    try {
        const res = await requestUrl({ url: "https://ipapi.co/json/" });
        if (res.status === 200) {
            const data = res.json;
            let ipAddr = data.city || data.country_name || "未知位置";
            if (data.region && data.region !== data.city) ipAddr += `, ${data.region}`;
            const coords = (data.latitude && data.longitude)
                ? { lat: data.latitude, lng: data.longitude }
                : undefined;
            return { address: ipAddr, coords };
        }
    } catch {
        // ignore
    }
    return { address: "" };
}

/**
 * 搜索附近 POI（通过 Overpass API）
 */
export async function fetchNearbyPOIs(lat: number, lng: number): Promise<string[]> {
    try {
        const query = `[out:json][timeout:10];(node(around:500,${lat},${lng})["name"]["amenity"];node(around:500,${lat},${lng})["name"]["shop"];node(around:500,${lat},${lng})["name"]["leisure"];node(around:500,${lat},${lng})["name"]["tourism"];way(around:300,${lat},${lng})["name"]["building"];);out center 10;`;
        const response = await requestUrl({
            url: `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
        });
        if (response.status === 200) {
            const data = response.json;
            const names: string[] = [];
            const seen = new Set<string>();
            for (const el of (data.elements || [])) {
                const name = el.tags?.name;
                if (name && !seen.has(name)) {
                    seen.add(name);
                    names.push(name);
                }
                if (names.length >= 10) break;
            }
            return names;
        }
    } catch (e) {
        console.warn("Nearby POI search failed", e);
    }
    return [];
}

/**
 * 构建候选地址列表（从反向地理编码 + POI 结果）
 */
export function buildAddressOptions(geocoded: string, nearbyPois: string[]): string[] {
    const options: string[] = [];
    if (geocoded) options.push(geocoded);
    nearbyPois.forEach(poi => {
        const fullOption = geocoded ? `${geocoded} · ${poi}` : poi;
        if (!options.includes(fullOption)) options.push(fullOption);
    });
    return options;
}

/**
 * 获取设备坐标（跨平台）
 * - Windows: WinRT Location API via PowerShell
 * - 其他: navigator.geolocation
 * @returns Promise<GeoCoordinates | null>
 */
export function getDeviceCoordinates(): Promise<GeoCoordinates | null> {
    if (Platform.isWin && Platform.isDesktop) {
        return getWindowsCoordinates();
    } else if (navigator.geolocation) {
        return getBrowserCoordinates();
    }
    return Promise.resolve(null);
}

function getBrowserCoordinates(): Promise<GeoCoordinates | null> {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (err) => {
                console.warn("Geolocation error:", err);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });
}

function getWindowsCoordinates(): Promise<GeoCoordinates | null> {
    return new Promise((resolve) => {
        try {
            const { exec } = require("child_process") as typeof import("child_process");
            const fs = require("fs") as typeof import("fs");
            const os = require("os") as typeof import("os");
            const path = require("path") as typeof import("path");

            const scriptPath = path.join(os.tmpdir(), `obsidian_geo_${Date.now()}.ps1`);

            const psContent = [
                'try {',
                '    $runtimeDir = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()',
                '    $dllPath = Join-Path $runtimeDir "System.Runtime.WindowsRuntime.dll"',
                '    if (Test-Path $dllPath) {',
                '        [System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null',
                '    } else {',
                '        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop',
                '    }',
                '',
                '    [Windows.Devices.Geolocation.Geolocator,Windows.Devices.Geolocation,ContentType=WindowsRuntime] | Out-Null',
                '',
                '    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {',
                "        $_.Name -eq 'AsTask' -and",
                '        $_.GetParameters().Count -eq 1 -and',
                "        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'",
                '    })[0]',
                '',
                '    if ($null -eq $asTaskGeneric) { throw "AsTask method not found" }',
                '',
                '    Function Await($WinRtTask, $ResultType) {',
                '        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)',
                '        $netTask = $asTask.Invoke($null, @($WinRtTask))',
                '        $netTask.Wait(-1) | Out-Null',
                '        $netTask.Result',
                '    }',
                '',
                '    $gl = New-Object Windows.Devices.Geolocation.Geolocator',
                '    $gl.DesiredAccuracyInMeters = 10',
                '    $pos = Await ($gl.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition])',
                '    $coord = $pos.Coordinate.Point.Position',
                '    @{lat=$coord.Latitude;lng=$coord.Longitude} | ConvertTo-Json -Compress',
                '} catch {',
                '    Write-Error $_.Exception.Message',
                '    exit 1',
                '}',
            ].join('\n');

            fs.writeFileSync(scriptPath, psContent, { encoding: 'utf8' });

            exec(
                `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
                { timeout: 25000 },
                (error: Error | null, stdout: string) => {
                    try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }

                    if (!error && stdout && stdout.trim()) {
                        try {
                            const result = JSON.parse(stdout.trim());
                            if (result.lat && result.lng) {
                                resolve({ lat: result.lat, lng: result.lng });
                                return;
                            }
                        } catch (parseErr) {
                            console.warn("PowerShell location parse error:", parseErr);
                        }
                    }
                    console.warn("Windows Location API failed, falling back", error);
                    resolve(null);
                }
            );
        } catch (e) {
            console.error("Windows location error:", e);
            resolve(null);
        }
    });
}
