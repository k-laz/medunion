# МИС «Ариадна»: API

What we know about the clinic's МИС API, checked 2026-11-10.

- The clinic's server `http://95.188.102.93:5500` runs Ariadna's **«API Личный кабинет»**
  (the back end of the patient portal). `GET /api/app.config` answers without a login;
  `/` answers `{"Err":"Not API"}`.
- Documentation (Swagger, version 5.10.4, vendor's demo):
  https://demo-server.reshenie-soft.ru/lkapi-5-10-4/ . The clinic's installed version is not confirmed.
- Plain HTTP, no TLS.

## Sign-in

Two methods:

1. `POST /api/login` with `login`/`passwd`, then header `Authorization: TOKEN <jwt>`.
   This is a patient-portal user login: requests act as that one patient.
2. Header `api-token: <token>` (one per МИС database) plus header `patientid` on
   patient routes. This is the server-to-server method the site needs: our server
   looks a patient up and books on their behalf.

The token is a secret: it lives only in the server's settings (environment), never in
the repository, the site's files, or a browser.

## Routes the site would use

| Need | Route |
|---|---|
| Clinics (филиалы) | `GET /record/filial/list` → `dep_id`, `dep_name` |
| Specialties with free slots | `GET /record/spec/list?beginDate&endDate&depId` → `keyid`, `text` |
| Doctors of a specialty | `GET /record/doc/list?beginDate&endDate&specID&depId` → `doctorid`, names, `rcount` (free slots), `srvlist` (paid services) |
| Free slots (талоны) | `GET /record/rnumb/list?doctorID&specID&beginDate&endDate&depId` → `rnumbid`, `dat_begin_str`, `dat_end_str`, `depid`, `depname` |
| Week view of all doctors | `GET /record/list/doctors/schedule?beginDate&endDate` |
| Find patient | `POST /record/patient/info` {surname, firstName, secondName, birthDate} → patient `keyid` |
| Hold a slot | `GET /record/rnumb/blstatus?rnumbID` |
| Book | `GET /record/rnumb/appointment?rnumbID&srvID` (header `patientid`) → `visit_id` |
| Release / cancel | `GET /record/rnumb/unlock?rnumbID`, `GET /record/rnumb/cancel?rnumbID` |
| Services and prices | `POST /record/rnumb/services-full-list` {beginDateRecord, endDateRecord} → `keyid`, `code`, `text`, `price`; per slot `GET /record/rnumb/serv?rnumbID` |
| Doctor details | `GET /doctor/info?doctor_id` (стаж, направление, стоимость приёма) |

## Open questions for the clinic / «Решение»

1. Is the `api-token` for our database included, or is it the paid part?
2. `/record/patient/info` finds an existing patient. Can a new patient be created
   server-to-server? (`POST /api/patient` needs a captcha and СНИЛС: built for the portal.)
3. HTTPS on the API, or at least allow only our server's IP.
4. Installed API version.
5. Does `services-full-list` hold the whole price list (МРТ, КТ, анализы) or only bookable services?
