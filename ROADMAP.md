# Timeline & Milestones

| Phase        | Time           | Frontend                                                      | Backend | Analytics                            |
|--------------|----------------|---------------------------------------------------------------|---------|--------------------------------------|
| Pre Season   | December, 2025 | Misc                                                          | Misc    | Misc                                 | 
| Pre Season   | January, 2026  | Misc                                                          | Misc    | Misc                                 | 
| Build Season | Week 1         | Plan match scouting UI                                        | None    | Release v1.0                         |
| Build Season | Week 2         | Write the match scouting UI                                   | None    | Start trying out algorithms          |
| Build Season | Week 3         | Write the match scouting UI, settle on pit scouting questions | None    | Keep trying out algorithms           |
| Build Season | Week 4         | Try out and improve on UI                                     | None    | Keep trying out algorithms           |
| Build Season | Week 5         | Improve UI                                                    | None    | Review algorithms                    |
| Build Season | Week 6         | Finalize UI                                                   | None    | Finalize algorithms and release v2.0 |
| Comp Season  | Week 1         | POH                                                           | POH     | POH                                  |
| Comp Season  | Week 2         | Review and make changes                                       | None    | Review and make changes              |
| Comp Season  | Week 3         | Review and make changes                                       | None    | Review and make changes              |
| Comp Season  | Week 4         | SGV                                                           | SGV     | SGV                                  |
| Post Season  | Week 5         | TBD                                                           | TBD     | TBD                                  |
| Post Season  | Week 6         | TBD                                                           | TBD     | TBD                                  |
| Post Season  | Champs         | TBD                                                           | TBD     | TBD                                  |
| Off Season   | May, 2026      | TBD                                                           | TBD     | TBD                                  |
| Off Season   | June, 2026     | TBD                                                           | TBD     | TBD                                  |
| Off Season   | July, 2026     | TBD                                                           | TBD     | TBD                                  |

---

## TODO(before 2026CAPOH): 

### Season specific:

- Make new match scouting ui
- Make new pit scouting questions
- Make new settings ui for the wpf app
- Make the analysis engine

#### Required changes:

- Make pre-match and post-match data page 
- Make a script to generate guest login info(mainly password and username but also permissions)
- Add the data navigation searchable dropdown to each data page
- Fix share data page's dropdown colors(bg and text are all white), also a way to print for all teams at once(otherwise it's going to be painful to distribute)
  
#### QOL:

- Fix auto population problems with alliance selection of alliance page
- Add proper percentage predictions for playoff simulation of alliance page
- Add random popup to ask provide feedback via the google form(also finish the form), using a wrapper
- Fix device and permission overlay conflicting
- Make more pages available on mobile(mostly admin and dev)
- Add more chart types as necessary for ranking data and add better title and legend for each chart
- Add match links in rp section of team data and team links in match data
- Add metadata for current match and actually use the timestamps fetched from tba for uses
- Replace the settings button in home with more, and redo settings page to not only include settings but also links to pages like candy
