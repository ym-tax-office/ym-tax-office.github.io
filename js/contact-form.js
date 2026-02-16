/**
 * Contact Form Common Script
 * 同業先生との意見交換フォーム・税務相談フォーム用の共通JavaScriptロジック
 */

// LIFE（）即実行関数：（）で囲まれた関数をページ読み込みと同時に即座に実行。
// 関数の中だけに変数や関数を閉じ込めることで、フォーム以外のページへの影響を防止するために使用。
// フォーム処理専用関数となる。
(function() {
  'use strict'; // 厳格モードで、危険なコードを検出

  /**
   * 初期化：フォーム機能をセットアップ
   */
  function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return; // フォームが存在しない場合は終了

    // エントリー時刻をミリ秒で設定(スパム対策：短時間での大量送信を検出するために使用)
    // JavaScript実行により、HTMLが、<input type="hidden" name="entry_time" id="entry_time" value="1708873456789" />のようになる。
    // valueは現在の時刻
    const entryTimeInput = document.getElementById('entry_time');
    if (entryTimeInput) {
      entryTimeInput.value = new Date().getTime();
    }

    // チェックボックスと送信ボタンのセットアップ
    setupCheckboxValidation();

    // 全角→半角変換のセットアップ
    setupHalfWidthConversion(form);

    // フォーム送信ハンドラー
    form.addEventListener('submit', handleFormSubmit);
  }

  /**
   * 同意チェックボックスの検証とボタン有効化制御
   */
  function setupCheckboxValidation() {
    const privacyCheck = document.getElementById('privacyCheck');
    const termsCheck = document.getElementById('termsCheck');
    const submitBtn = document.getElementById('submit-btn');

    if (!privacyCheck || !termsCheck || !submitBtn) return;

    // 送信ボタン有効化制御関数
    const updateSubmitButton = () => {
      submitBtn.disabled = !(privacyCheck.checked && termsCheck.checked);
    };
    // changeイベント：ユーザーがチェックボックスの状態を変更したときに発動
    privacyCheck.addEventListener('change', updateSubmitButton);
    termsCheck.addEventListener('change', updateSubmitButton);

    // 初期状態をセット
    updateSubmitButton();
  }

  /**
   * 全角→半角自動変換のセットアップ
   * @param {HTMLFormElement} form - 対象フォーム
   */
  function setupHalfWidthConversion(form) {
    // 税理士登録番号フィールド（peer フォームのみ）
    const taxRegInput = form.querySelector('input[name="tax_registration_number"]');
    if (taxRegInput) {
      setupFieldConversion(taxRegInput, 'default');
    }

    // メールアドレスフィールド（両フォーム）
    const emailInput = form.querySelector('input[name="user_email"]');
    if (emailInput) {
      setupFieldConversion(emailInput, 'email');
    }

    // 電話番号フィールド（tax フォームのみ）
    const phoneInput = form.querySelector('input[name="user_phone"]');
    if (phoneInput) {
      setupFieldConversion(phoneInput, 'phone');
    }
  }

  /**
   * 個別フィールドの全角→半角変換をセットアップ
   * @param {HTMLInputElement} inputElement - 対象入力フィールド
   * @param {string} type - フィールドタイプ ('default' | 'email' | 'phone')
   */
  function setupFieldConversion(inputElement, type) {
    // blurイベント：ユーザーが入力欄をクリックして、別の場所をクリックしたとき（フォーカスが外れたとき）に発動
    inputElement.addEventListener('blur', function() {
      let value = this.value
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0)) // 全角数字を半角数字に変換
        .replace(/[＠]/g, '@')  // 全角@
        .replace(/[．]/g, '.')  // 全角ドット
        .trim();

      // タイプ別の追加処理
      if (type === 'phone') {
        value = value
          .replace(/[ー－‐]/g, '-')  // ハイフン統一
          .replace(/\s/g, '');        // スペース除去

        // 電話番号形式チェック
        const phonePattern = /^0\d{1,4}-\d{1,4}-\d{3,4}$/;
        if (value !== '' && !phonePattern.test(value)) {
          this.setCustomValidity('電話番号の形式が正しくないようです（例: 090-1234-5678）');
          this.reportValidity();
        } else {
          this.setCustomValidity('');
        }
      }

      this.value = value;
    });
  }

  /**
   * フォーム送信ハンドラー
   * @param {Event} e - submit イベント
   */
  function handleFormSubmit(e) {
    // preventDefault()： フォームのデフォルト送信動作(ページのリロード)をキャンセル
    e.preventDefault();

    const form = e.target;
    const submitBtn = document.getElementById('submit-btn');

    // 1. ブラウザ標準のバリデーション実行(必須フィールドの確認等)
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // 2. メールアドレスの追加チェック（ドット必須）
    const emailInput = form.querySelector('input[name="user_email"]');
    if (emailInput && !emailInput.value.includes('.')) {
      alert('メールアドレスにはドメイン（.jp や .com など）が必要です。');
      return;
    }

    // 3. ボタンを送信中状態に変更(二重送信を防止)
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = '送信中...';
    }

    // 4. FormData を準備(フォーム内の全てのデータを集めて、送信用に整理するオブジェクト)
    // {key,pair}でデータを格納。keyはinputのname属性、pairはユーザーが入力した値。
    const formData = new FormData(form);

    // 5. Turnstile トークンが見つかったらcf-turnstile-responseというkeyでFormDataに追加(GAS側でボット判定するために必要。)
    const turnstileRes = document.querySelector('[name=cf-turnstile-response]');
    if (!turnstileRes || !turnstileRes.value) {
      alert('認証確認に失敗しました。もう一度お試しください。');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = '送信する';
      }
      return;
    }

    // 6. GASのURLを取得（ここで1回だけ宣言！）
    const gasUrl = form.getAttribute('data-gas-url');

    // 7. GAS へ送信
    if (!gasUrl) {
      console.error('GAS URL が設定されていません');
      alert('システムエラーが発生しました。管理者にお問い合わせください。');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = '送信する';
      }
      return;
    }

    // インターネット上のサーバー（ここではGoogleのGAS）にデータを送信する関数
    fetch(gasUrl, {
      method: 'POST',
      body: formData,       // FormData そのまま送信
      mode: 'cors'          // CORS モード
    })
    .then(res => res.json()) // JSON レスポンスを取得
    .then(data => {
      if (data.success) {
        // 成功時：フォーム非表示、成功メッセージ表示
        form.classList.add('d-none');
        document.getElementById('success-message')?.classList.remove('d-none');
        window.scrollTo(0, 0);
      } else {
        // エラー時：アラート表示
        alert('送信エラー: ' + (data.error || '不明'));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = '送信する';
        }
      }
    })
    .catch(err => {
      // ネットワークエラーなど
      console.error('送信エラー:', err);
      alert('通信エラーが発生しました。');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = '送信する';
      }
    });
  }

  /**
   * DOMが読み込まれたら初期化を実行(ページ全体のHTMLが読み込まれる前にJavaScriptが実行されるのを防ぐ)
   */
  // document.readyState: 'loading'：まだ読み込み中
  if (document.readyState === 'loading') {
    // loading中なら、DOMContentLoadedイベント発火時にinitContactFormを実行
    document.addEventListener('DOMContentLoaded', initContactForm);
  } else {
    initContactForm();
  }
})();