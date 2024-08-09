/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import * as zrUtil from 'zrender/src/core/util';
import Scale from './Scale';
import * as numberUtil from '../util/number';
import * as scaleHelper from './helper';

// Use some method of IntervalScale
import IntervalScale from './Interval';
import SeriesData from '../data/SeriesData';
import { DimensionName, ScaleTick } from '../util/types';

const scaleProto = Scale.prototype;
// FIXME:TS refactor: not good to call it directly with `this`?
const intervalScaleProto = IntervalScale.prototype;

const roundingErrorFix = numberUtil.round;

const mathFloor = Math.floor;
const mathCeil = Math.ceil;
const mathPow = Math.pow;

const mathLog = Math.log;

class LogScale extends Scale {
    static type = 'log';
    readonly type = 'log';

    base = 10;

    private _originalScale: IntervalScale = new IntervalScale();

    private _fixMin: boolean;
    private _fixMax: boolean;

    private _interval: number = 0;
    private _niceExtent: [number, number];

    getTicks(expandToNicedExtent?: boolean): ScaleTick[] {
        const originalScale = this._originalScale;
        const extent = this._extent;
        const originalExtent = originalScale.getExtent();

        const ticks = intervalScaleProto.getTicks.call(this, expandToNicedExtent);

        // Ajoutez 0 comme un tick séparé si l'intervalle comprend 0
        const hasZero = extent[0] <= 0;

        const finalTicks = zrUtil.map(ticks, function (tick) {
            const val = tick.value;
            let powVal = numberUtil.round(mathPow(this.base, val));

            powVal = (val === extent[0] && this._fixMin)
                ? fixRoundingError(powVal, originalExtent[0])
                : powVal;
            powVal = (val === extent[1] && this._fixMax)
                ? fixRoundingError(powVal, originalExtent[1])
                : powVal;

            return {
                value: powVal
            };
        }, this);

        if (hasZero) {
            finalTicks.unshift({ value: 0 });
        }

        return finalTicks;
    }

    setExtent(start: number, end: number): void {
        const base = mathLog(this.base);

        // Filtrer les valeurs <= 0
        if (start <= 0) {
            start = 0; // Conservez 0 au lieu de 0.01
        }
        else {
            start = mathLog(start) / base;
        }

        if (end <= 0) {
            end = 0; // Conservez 0 au lieu de 0.01
        }
        else {
            end = mathLog(end) / base;
        }

        intervalScaleProto.setExtent.call(this, start, end);
    }

    getExtent() {
        const base = this.base;
        const extent = scaleProto.getExtent.call(this);
        extent[0] = mathPow(base, extent[0]);
        extent[1] = mathPow(base, extent[1]);

        const originalScale = this._originalScale;
        const originalExtent = originalScale.getExtent();
        this._fixMin && (extent[0] = fixRoundingError(extent[0], originalExtent[0]));
        this._fixMax && (extent[1] = fixRoundingError(extent[1], originalExtent[1]));

        return extent;
    }

    unionExtent(extent: [number, number]): void {
        this._originalScale.unionExtent(extent);

        const base = this.base;

        // Filtrer les valeurs <= 0
        if (extent[0] <= 0) {
            extent[0] = 0; // Conservez 0 au lieu de 0.01
        }
        else {
            extent[0] = mathLog(extent[0]) / mathLog(base);
        }

        if (extent[1] <= 0) {
            extent[1] = 0; // Conservez 0 au lieu de 0.01
        }
        else {
            extent[1] = mathLog(extent[1]) / mathLog(base);
        }

        scaleProto.unionExtent.call(this, extent);
    }

    unionExtentFromData(data: SeriesData, dim: DimensionName): void {
        const extent = data.getApproximateExtent(dim);

        // Filtrer les valeurs <= 0
        if (extent[0] <= 0) {
            extent[0] = 0; // Conservez 0 au lieu de 0.01
        }

        if (extent[1] <= 0) {
            extent[1] = 0; // Conservez 0 au lieu de 0.01
        }

        this.unionExtent(extent);
    }

    calcNiceTicks(approxTickNum: number): void {
        approxTickNum = approxTickNum || 10;
        const extent = this._extent;
        const span = extent[1] - extent[0];
        if (span === Infinity || span <= 0) {
            return;
        }

        let interval = numberUtil.quantity(span);
        const err = approxTickNum / span * interval;

        if (err <= 0.5) {
            interval *= 10;
        }

        while (!isNaN(interval) && Math.abs(interval) < 1 && Math.abs(interval) > 0) {
            interval *= 10;
        }

        const niceExtent = [
            numberUtil.round(mathCeil(extent[0] / interval) * interval),
            numberUtil.round(mathFloor(extent[1] / interval) * interval)
        ] as [number, number];

        this._interval = interval;
        this._niceExtent = niceExtent;
    }

    calcNiceExtent(opt: {
        splitNumber: number,
        fixMin?: boolean,
        fixMax?: boolean,
        minInterval?: number,
        maxInterval?: number
    }): void {
        intervalScaleProto.calcNiceExtent.call(this, opt);

        this._fixMin = opt.fixMin;
        this._fixMax = opt.fixMax;
    }

    parse(val: any): number {
        return val;
    }

    contain(val: number): boolean {
        if (val <= 0) {
            return false;
        } // Filtrer les valeurs <= 0
        val = mathLog(val) / mathLog(this.base);
        return scaleHelper.contain(val, this._extent);
    }

    normalize(val: number): number {
        if (val <= 0) {
            val = 0.01;
        } // Filtrer les valeurs <= 0
        val = mathLog(val) / mathLog(this.base);
        return scaleHelper.normalize(val, this._extent);
    }

    scale(val: number): number {
        if (val <= 0) {
            val = 0.01;
        } // Filtrer les valeurs <= 0
        val = scaleHelper.scale(val, this._extent);
        return mathPow(this.base, val);
    }

    getMinorTicks: IntervalScale['getMinorTicks'];
    getLabel: IntervalScale['getLabel'];
}

const proto = LogScale.prototype;
proto.getMinorTicks = intervalScaleProto.getMinorTicks;
proto.getLabel = intervalScaleProto.getLabel;

function fixRoundingError(val: number, originalVal: number): number {
    return roundingErrorFix(val, numberUtil.getPrecision(originalVal));
}

Scale.registerClass(LogScale);

export default LogScale;