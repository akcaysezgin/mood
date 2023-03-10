// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CoreError } from '@classes/errors/error';
import {
    CoreReportBuilder,
    CoreReportBuilderReportDetail,
    CoreReportBuilderRetrieveReportMapped,
    REPORT_ROWS_LIMIT,
} from '@features/reportbuilder/services/reportbuilder';
import { IonRefresher } from '@ionic/angular';
import { CoreNavigator } from '@services/navigator';
import { CoreScreen } from '@services/screen';
import { CoreDomUtils } from '@services/utils/dom';
import { CoreUtils } from '@services/utils/utils';
import { BehaviorSubject } from 'rxjs';

@Component({
    selector: 'core-report-builder-report-detail',
    templateUrl: './report-detail.html',
    styleUrls: ['./report-detail.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoreReportBuilderReportDetailComponent implements OnInit {

    @Input() reportId!: string;
    @Input() isBlock = true;
    @Input() perPage?: number;
    @Input() layout: 'card' | 'table' | 'adaptative' = 'adaptative';
    @Output() onReportLoaded = new EventEmitter<CoreReportBuilderReportDetail>();

    get isCardLayout(): boolean {
        return this.layout === 'card' || (CoreScreen.isMobile && this.layout === 'adaptative');
    }

    state$: Readonly<BehaviorSubject<CoreReportBuilderReportDetailState>> = new BehaviorSubject({
        report: null,
        loaded: false,
        canLoadMoreRows: true,
        errorLoadingRows: false,
        cardviewShowFirstTitle: false,
        cardVisibleColumns: 1,
        page: 0,
    });

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        await this.getReport();
        this.updateState({ loaded: true });
    }

    /**
     * Get report data.
     */
    async getReport(): Promise<void> {
        if (!this.reportId) {
            CoreDomUtils.showErrorModal(new CoreError('No report found'));
            CoreNavigator.back();

            return;
        }

        const { page } = this.state$.getValue();

        const report = await CoreReportBuilder.loadReport(parseInt(this.reportId), page,this.perPage ?? REPORT_ROWS_LIMIT);

        if (!report) {
            CoreDomUtils.showErrorModal(new CoreError('No report found'));
            CoreNavigator.back();

            return;
        }

        await CoreReportBuilder.viewReport(this.reportId);

        this.updateState({
            report,
            cardVisibleColumns: report.details.settingsdata.cardviewVisibleColumns,
            cardviewShowFirstTitle: report.details.settingsdata.cardviewShowFirstTitle,
        });

        this.onReportLoaded.emit(report.details);
    }

    updateState(state: Partial<CoreReportBuilderReportDetailState>): void {
        const previousState = this.state$.getValue();
        this.state$.next({ ...previousState, ...state });
    }

    /**
     * Update report data.
     *
     * @param ionRefresher ionic refresher.
     */
    async refreshReport(ionRefresher?: IonRefresher): Promise<void> {
        await CoreUtils.ignoreErrors(CoreReportBuilder.invalidateReport());
        this.updateState({ page: 0, canLoadMoreRows: false });
        await CoreUtils.ignoreErrors(this.getReport());
        await ionRefresher?.complete();
        this.updateState({ canLoadMoreRows: true });
    }

    /**
     * Increment page of report rows.
     */
    protected incrementPage(): void {
        const { page } = this.state$.getValue();
        this.updateState({ page: page + 1 });
    }

    /**
     * Load a new batch of pages.
     *
     * @param complete Completion callback.
     */
    async fetchMoreInfo(complete: () => void): Promise<void> {
        const { canLoadMoreRows, report } = this.state$.getValue();

        if (!canLoadMoreRows) {
            complete();

            return;
        }

        try {
            this.incrementPage();

            const { page: currentPage } = this.state$.getValue();

            const newReport = await CoreReportBuilder.loadReport(parseInt(this.reportId), currentPage, REPORT_ROWS_LIMIT);

            if (!report || !newReport || newReport.data.rows.length === 0) {
                this.updateState({ canLoadMoreRows: false });
                complete();

                return;
            }

            this.updateState({
                report: {
                    ...report,
                    data: {
                        ...report.data,
                        rows: [
                            ...report.data.rows,
                            ...newReport.data.rows,
                        ],
                    },
                },
            });
        } catch (error) {
            CoreDomUtils.showErrorModalDefault(error, 'Error loading more reports');

            this.updateState({ canLoadMoreRows: false });
            this.updateState({ errorLoadingRows: true });
        }

        complete();
    }

    /**
     * Expand or close card.
     *
     * @param rowIndex card to expand or close.
     */
    toggleRow(rowIndex: number): void {
        const { report } = this.state$.getValue();

        if (!report?.data?.rows[rowIndex]) {
            return;
        }

        report.data.rows[rowIndex].isExpanded = !report.data.rows[rowIndex].isExpanded;
        this.updateState({ report });
    }

}

export type CoreReportBuilderReportDetailState = {
    report: CoreReportBuilderRetrieveReportMapped | null;
    loaded: boolean;
    canLoadMoreRows: boolean;
    errorLoadingRows: boolean;
    cardviewShowFirstTitle: boolean;
    cardVisibleColumns: number;
    page: number;
};
